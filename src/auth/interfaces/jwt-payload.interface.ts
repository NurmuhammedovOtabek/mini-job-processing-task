import { Role } from '../../users/enums/role.enum';

export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
}
