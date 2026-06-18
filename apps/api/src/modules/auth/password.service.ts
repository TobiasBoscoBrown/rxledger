import { Injectable } from '@nestjs/common';
import bcrypt from 'bcryptjs';

/**
 * Password hashing with bcrypt (cost 12). bcryptjs is the pure-JS implementation
 * of the same algorithm the spec names; swap for the native `bcrypt` binding in
 * production for throughput. Cost is centralized here so it can be raised over
 * time without touching call sites.
 */
@Injectable()
export class PasswordService {
  private readonly cost = 12;

  async hash(plaintext: string): Promise<string> {
    return bcrypt.hash(plaintext, this.cost);
  }

  async verify(plaintext: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plaintext, hash);
  }
}
