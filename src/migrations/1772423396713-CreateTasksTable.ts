import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateTasksTable1772423396713 implements MigrationInterface {
    name = 'CreateTasksTable1772423396713'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."tasks_priority_enum" AS ENUM('high', 'normal', 'low')`);
        await queryRunner.query(`CREATE TYPE "public"."tasks_status_enum" AS ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED')`);
        await queryRunner.query(`CREATE TABLE "tasks" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "type" character varying NOT NULL, "priority" "public"."tasks_priority_enum" NOT NULL DEFAULT 'normal', "payload" jsonb NOT NULL DEFAULT '{}', "status" "public"."tasks_status_enum" NOT NULL DEFAULT 'PENDING', "idempotency_key" character varying NOT NULL, "attempts" integer NOT NULL DEFAULT '0', "last_error" text, "scheduled_at" TIMESTAMP WITH TIME ZONE, "started_at" TIMESTAMP WITH TIME ZONE, "completed_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_06021e86f55c95aa79fc4fc6b6e" UNIQUE ("idempotency_key"), CONSTRAINT "PK_8d12ff38fcc62aaba2cab748772" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_tasks_idempotency_key" ON "tasks" ("idempotency_key") `);
        await queryRunner.query(`CREATE INDEX "IDX_tasks_scheduled_at" ON "tasks" ("scheduled_at") `);
        await queryRunner.query(`CREATE INDEX "IDX_tasks_type" ON "tasks" ("type") `);
        await queryRunner.query(`CREATE INDEX "IDX_tasks_status" ON "tasks" ("status") `);
        await queryRunner.query(`CREATE INDEX "IDX_tasks_user_id" ON "tasks" ("user_id") `);
        await queryRunner.query(`ALTER TABLE "tasks" ADD CONSTRAINT "FK_db55af84c226af9dce09487b61b" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "tasks" DROP CONSTRAINT "FK_db55af84c226af9dce09487b61b"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_tasks_user_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_tasks_status"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_tasks_type"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_tasks_scheduled_at"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_tasks_idempotency_key"`);
        await queryRunner.query(`DROP TABLE "tasks"`);
        await queryRunner.query(`DROP TYPE "public"."tasks_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."tasks_priority_enum"`);
    }

}
