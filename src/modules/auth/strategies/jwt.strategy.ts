import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';
import { AppConfig } from '../../../config/configuration';
import { User } from '../../users/entities/user.entity';

export interface JwtPayload {
  sub: string;
  username: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService<AppConfig, true>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get('auth.accessSecret', { infer: true }),
    });
  }

  /** Reject tokens whose user has been deleted since issuance. */
  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const exists = await this.usersRepository.exists({ where: { id: payload.sub } });
    if (!exists) {
      throw new UnauthorizedException('User no longer exists');
    }
    return { id: payload.sub, username: payload.username };
  }
}
