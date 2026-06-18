import { Injectable } from '@nestjs/common';
import {
  PrescriptionStatus,
  type CreatePrescriptionInput,
  type TransitionPrescriptionInput,
  type Role,
} from '@rxledger/contracts';
import { DatabaseService } from '../../database/database.service';
import { FieldCipherService } from '../crypto/field-cipher.service';
import { AuditService } from '../audit/audit.service';
import { NotFoundError, StaleVersionError } from '../../common/errors';
import { PrescriptionStateMachine } from './prescription.state-machine';

interface ProtocolItem {
  peptide: string;
  dosage: string;
  frequency: string;
  durationWeeks: number;
}

export interface PrescriptionView {
  id: string;
  patientId: string;
  encounterId: string;
  status: PrescriptionStatus;
  indication: string;
  items: ProtocolItem[];
  peptides: string[];
  version: number;
  createdAt: string;
  updatedAt: string;
}

interface PrescriptionRow {
  id: string;
  patient_id: string;
  encounter_id: string;
  status: PrescriptionStatus;
  indication_enc: string;
  items_enc: string;
  peptides: string[];
  version: number;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class PrescriptionsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly cipher: FieldCipherService,
    private readonly audit: AuditService,
  ) {}

  async create(actor: { id: string; role: Role }, input: CreatePrescriptionInput): Promise<PrescriptionView> {
    const peptides = input.items.map((i) => i.peptide);
    return this.db.withTransaction(async (client) => {
      const row = (
        await client.query<PrescriptionRow>(
          `INSERT INTO prescriptions
             (patient_id, encounter_id, status, indication_enc, items_enc, peptides, created_by)
           VALUES ($1, $2, 'draft', $3, $4, $5, $6)
           RETURNING *`,
          [
            input.patientId,
            input.encounterId,
            this.cipher.encrypt(input.indication),
            this.cipher.encrypt(JSON.stringify(input.items)),
            peptides,
            actor.id,
          ],
        )
      ).rows[0]!;

      await client.query(
        `INSERT INTO prescription_events (prescription_id, from_status, to_status, actor_id)
         VALUES ($1, NULL, 'draft', $2)`,
        [row.id, actor.id],
      );
      await this.audit.record(
        {
          actorId: actor.id,
          actorRole: actor.role,
          action: 'prescription.create',
          resourceType: 'prescription',
          resourceId: row.id,
          phiAccessed: true,
          metadata: { peptides },
        },
        client,
      );
      return this.decode(row);
    }, actor.id);
  }

  /**
   * Transition a prescription. Concurrency-safe: the row is locked FOR UPDATE,
   * the caller's expected `version` is checked (optimistic lock), the move is
   * validated by the pure state machine, and the status change + event row +
   * audit row all commit together or not at all.
   */
  async transition(
    id: string,
    actor: { id: string; role: Role },
    input: TransitionPrescriptionInput,
  ): Promise<PrescriptionView> {
    return this.db.withTransaction(async (client) => {
      const current = (
        await client.query<PrescriptionRow>('SELECT * FROM prescriptions WHERE id = $1 FOR UPDATE', [id])
      ).rows[0];
      if (!current) throw new NotFoundError('prescription', id);

      if (current.version !== input.version) {
        throw new StaleVersionError(current.version, input.version);
      }

      PrescriptionStateMachine.assertTransition(current.status, input.toStatus, actor.role);

      const updated = (
        await client.query<PrescriptionRow>(
          `UPDATE prescriptions
             SET status = $2, version = version + 1, updated_at = now()
           WHERE id = $1 AND version = $3
           RETURNING *`,
          [id, input.toStatus, input.version],
        )
      ).rows[0]!;

      await client.query(
        `INSERT INTO prescription_events (prescription_id, from_status, to_status, actor_id, reason)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, current.status, input.toStatus, actor.id, input.reason ?? null],
      );
      await this.audit.record(
        {
          actorId: actor.id,
          actorRole: actor.role,
          action: 'prescription.transition',
          resourceType: 'prescription',
          resourceId: id,
          metadata: { from: current.status, to: input.toStatus, reason: input.reason },
        },
        client,
      );
      return this.decode(updated);
    }, actor.id);
  }

  async getById(id: string): Promise<PrescriptionView> {
    const row = await this.db.queryOne<PrescriptionRow>('SELECT * FROM prescriptions WHERE id = $1', [
      id,
    ]);
    if (!row) throw new NotFoundError('prescription', id);
    return this.decode(row);
  }

  private decode(row: PrescriptionRow): PrescriptionView {
    return {
      id: row.id,
      patientId: row.patient_id,
      encounterId: row.encounter_id,
      status: row.status,
      indication: this.cipher.decrypt(row.indication_enc),
      items: JSON.parse(this.cipher.decrypt(row.items_enc)) as ProtocolItem[],
      peptides: row.peptides,
      version: row.version,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }
}
