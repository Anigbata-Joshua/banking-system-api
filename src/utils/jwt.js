import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export function signAccessToken(payload) {
    return jwt.sign(payload, env.jwtAccessSecret, {
        expiresIn: env.jwtAccessExpiresIn,
    });
}

export function signRefreshToken(payload) {
    return jwt.sign(payload, env.jwtRefreshSecret, {
        expiresIn: env.jwtRefreshExpiresIn,
    });
}

export function verifyAccessToken(token) {
    return jwt.verify(token, env.jwtAccessSecret);
}

export function verifyRefreshToken(token) {
    return jwt.verify(token, env.jwtRefreshSecret);
}