export interface JwtUser {
  sub: string;
  role: 'super' | 'regular';
  iat: number;
  exp: number;
}