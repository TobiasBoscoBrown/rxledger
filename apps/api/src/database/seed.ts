import { Client } from 'pg';
import bcrypt from 'bcryptjs';
import { LocalKmsService } from '../modules/crypto/kms.service';
import { FieldCipherService } from '../modules/crypto/field-cipher.service';

/**
 * Seeds a demo admin, clinician, and patient, plus one encounter and a draft
 * prescription whose PHI is stored as envelope ciphertext — so a reviewer can
 * SELECT the rows and see that dob/notes/indication are never plaintext.
 */
async function main(): Promise<void> {
  const connectionString = process.env['DATABASE_URL'];
  const masterKey = process.env['KMS_MASTER_KEY'];
  if (!connectionString) throw new Error('DATABASE_URL is required');
  if (!masterKey) throw new Error('KMS_MASTER_KEY is required');

  const cipher = new FieldCipherService(new LocalKmsService(masterKey));
  const ssl = /localhost|127\.0\.0\.1/.test(connectionString) ? false : { rejectUnauthorized: false };
  const client = new Client({ connectionString, ssl });
  await client.connect();

  try {
    const pw = await bcrypt.hash('Demo-Passw0rd!', 12);
    const mkUser = async (email: string, role: string): Promise<string> => {
      const r = await client.query<{ id: string }>(
        `INSERT INTO users (email, password_hash, role) VALUES ($1,$2,$3)
         ON CONFLICT (email) DO UPDATE SET role = EXCLUDED.role
         RETURNING id`,
        [email, pw, role],
      );
      return r.rows[0]!.id;
    };

    const adminId = await mkUser('admin@rxledger.demo', 'admin');
    const clinicianId = await mkUser('clinician@rxledger.demo', 'clinician');
    const patientId = await mkUser('patient@rxledger.demo', 'patient');

    const enc = await client.query<{ id: string }>(
      `INSERT INTO encounters (patient_id, clinician_id, chief_complaint_enc, clinician_notes_enc)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [
        patientId,
        clinicianId,
        cipher.encrypt('Fatigue and slow post-training recovery'),
        cipher.encrypt('Candidate for BPC-157 protocol; no contraindications noted.'),
      ],
    );
    const encounterId = enc.rows[0]!.id;

    const items = [{ peptide: 'BPC-157', dosage: '250mcg', frequency: 'BID', durationWeeks: 8 }];
    await client.query(
      `INSERT INTO prescriptions
         (patient_id, encounter_id, status, indication_enc, items_enc, peptides, created_by)
       VALUES ($1, $2, 'draft', $3, $4, $5, $6)`,
      [
        patientId,
        encounterId,
        cipher.encrypt('Soft-tissue recovery support'),
        cipher.encrypt(JSON.stringify(items)),
        items.map((i) => i.peptide),
        clinicianId,
      ],
    );

    await client.query(
      `INSERT INTO audit_log (actor_id, actor_role, action, resource_type, resource_id)
       VALUES ($1, 'admin', 'seed.run', 'system', 'seed')`,
      [adminId],
    );

    console.log('Seed complete. Demo login: <role>@rxledger.demo / Demo-Passw0rd!');
    console.log({ adminId, clinicianId, patientId, encounterId });
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
