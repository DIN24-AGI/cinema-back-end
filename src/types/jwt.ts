export interface JwtUser {
	sub: string;
	role: "super" | "regular";
	iat: number;
	exp: number;
}

declare global {
	namespace Express {
		interface Request {
			user?: JwtUser; // Changed from JWTPayload to JwtUser
		}
	}
}
