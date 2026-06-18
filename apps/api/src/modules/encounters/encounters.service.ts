import { Injectable } from '@nestjs/common';
import type { CreateEncounterInput } from '@rxledger/contracts';
import { DatabaseService } from '../../database/database.service';
import { FieldCipherService } from '../crypto/field-cipher.service';
import { AuditService } from '../audit/audit.service';
import { NotFoundError } from '../../common/errors';

export interface EncounterView {
  id: string;
  patientId: string;
  clinicianId: string;
  chiefComplaint: string;
  clinicianNotes: string | null;
  createdAt: string;
}

interface EncounterRow {
  id: string;
  patient_id: string;
  clinician_id: string;
  chief_complaint_enc: string;
  clinician_notes_enc: string | null;
  created_at: Date;
}

/**
 * Clinician encounters. The free-text PHI fields are encrypted before they ever
 * hit the database and decrypted only when an authorized caller reads them —
 * every read of decrypted PHI is audited at the controller via @Audited.
 */
@Injectable()
export class EncountersService {
  constructor(
    private readonly db: DatabaseService,
    private readonly cipher: FieldCipherService,
    private readonly audit: AuditService,
  ) {}

  async create(clinicianId: string, input: CreateEncounterInput): Promise<EncounterView> {
    return this.db.withTransaction(async (client) => {
      const row = (
        await client.query<EncounterRow>(
          `INSERT INTO encounters
             (patient_id, clinician_id, chief_complaint_enc, clinician_notes_enc)
           VALUES ($1, $2, $3, $4)
           RETURNING *`,
          [
            input.patientId,
            clinicianId,
            this.cipher.encrypt(input.chiefComplaint),
            input.clinicianNotes ? this.cipher.encrypt(input.clinicianNotes) : null,
          ],
        )
      ).rows[0]!;

      await this.audit.record(
        {
          actorId: clinicianId,
          actorRole: 'clinician',
          action: 'encounter.create',
          resourceType: 'encounter',
          resourceId: row.id,
          phiAccessed: true,
          metadata: { patientId: input.patientId },
        },
        client,
      );

      return this.decode(row);
    }, clinicianId);
  }

  async getById(id: string): Promise<EncounterView> {
    const row = await this.db.queryOne<EncounterRow>('SELECT * FROM encounters WHERE id = $1', [id]);
    if (!row) throw new NotFoundError('encounter', id);
    return this.decode(row);
  }

  private decode(row: EncounterRow): EncounterView {
    return {
      id: row.id,
      patientId: row.patient_id,
      clinicianId: row.clinician_id,
      chiefComplaint: this.cipher.decrypt(row.chief_complaint_enc),
      clinicianNotes: row.clinician_notes_enc ? this.cipher.decrypt(row.clinician_notes_enc) : null,
      createdAt: row.created_at.toISOString(),
    };
  }
}
