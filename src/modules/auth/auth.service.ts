import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';
import { DataSource, IsNull, MoreThan, Repository } from 'typeorm';
import { AppConfig } from '../../config/configuration';
import { Settings } from '../settings/entities/settings.entity';
import { User } from '../users/entities/user.entity';
import { LoginDto, SignupDto } from './dto/auth.dto';
import { RefreshToken } from './entities/refresh-token.entity';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  /** Unix epoch seconds when the access token expires. */
  accessTokenExpiresAt: number;
}

export interface AuthResult {
  user: User;
  tokens: AuthTokens;
}

const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19456, // 19 MiB — OWASP recommended baseline
  timeCost: 2,
  parallelism: 1,
};

@Injectable()
export class AuthService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<AppConfig, true>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokensRepository: Repository<RefreshToken>,
  ) {}

  async signup(dto: SignupDto): Promise<AuthResult> {
    const username = dto.username.toLowerCase();
    const passwordHash = await argon2.hash(dto.password, ARGON2_OPTIONS);

    const user = await this.dataSource.transaction(async (manager) => {
      const existing = await manager.getRepository(User).findOneBy({ username });
      if (existing) {
        throw new ConflictException('This username is already taken');
      }
      const created = await manager.getRepository(User).save(
        manager.getRepository(User).create({
          username,
          passwordHash,
          fullName: dto.fullName.trim(),
          note: dto.note ?? null,
        }),
      );
      await manager
        .getRepository(Settings)
        .save(manager.getRepository(Settings).create({ userId: created.id }));
      return created;
    });

    const tokens = await this.issueTokens(user);
    return { user, tokens };
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const username = dto.username.toLowerCase();
    const user = await this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.username = :username', { username })
      .getOne();

    // Verify against a dummy hash when the user is unknown to keep timing uniform.
    const hash =
      user?.passwordHash ??
      '$argon2id$v=19$m=19456,t=2,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    const valid = await argon2.verify(hash, dto.password).catch(() => false);
    if (!user || !valid) {
      throw new UnauthorizedException('Invalid username or password');
    }

    // Opportunistic cleanup of dead tokens for this user.
    await this.refreshTokensRepository
      .createQueryBuilder()
      .delete()
      .where('user_id = :userId', { userId: user.id })
      .andWhere('(expires_at < now() OR revoked_at IS NOT NULL)')
      .execute();

    const tokens = await this.issueTokens(user);
    return { user, tokens };
  }

  /**
   * Rotate a refresh token: the presented token is revoked and a fresh one is
   * issued with a full TTL window (sliding "30 days of non-use" expiry).
   */
  async refresh(rawToken: string): Promise<AuthTokens> {
    const tokenHash = this.hashToken(rawToken);
    const stored = await this.refreshTokensRepository.findOne({
      where: { tokenHash, revokedAt: IsNull(), expiresAt: MoreThan(new Date()) },
      relations: { user: true },
    });
    if (!stored || !stored.user) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    stored.revokedAt = new Date();
    await this.refreshTokensRepository.save(stored);

    return this.issueTokens(stored.user);
  }

  async logout(rawToken: string): Promise<void> {
    const tokenHash = this.hashToken(rawToken);
    await this.refreshTokensRepository.update(
      { tokenHash, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  private async issueTokens(user: User): Promise<AuthTokens> {
    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      username: user.username,
    });
    const decoded = this.jwtService.decode<{ exp: number }>(accessToken);

    const rawRefreshToken = randomBytes(48).toString('base64url');
    const ttlDays = this.configService.get('auth.refreshTtlDays', { infer: true });
    const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);
    await this.refreshTokensRepository.save(
      this.refreshTokensRepository.create({
        userId: user.id,
        tokenHash: this.hashToken(rawRefreshToken),
        expiresAt,
      }),
    );

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      accessTokenExpiresAt: decoded.exp,
    };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
