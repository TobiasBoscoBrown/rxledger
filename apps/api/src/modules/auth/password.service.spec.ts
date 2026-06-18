import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const passwords = new PasswordService();

  it('hashes to a bcrypt string and verifies the original', async () => {
    const hash = await passwords.hash('Demo-Passw0rd!');
    expect(hash).toMatch(/^\$2[aby]\$/);
    expect(await passwords.verify('Demo-Passw0rd!', hash)).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await passwords.hash('correct horse battery staple');
    expect(await passwords.verify('wrong', hash)).toBe(false);
  });

  it('produces distinct salted hashes for the same input', async () => {
    expect(await passwords.hash('same')).not.toBe(await passwords.hash('same'));
  });
});
