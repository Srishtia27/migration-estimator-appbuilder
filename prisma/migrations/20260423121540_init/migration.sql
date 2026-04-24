-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "hashed_password" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activities" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "tool" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "input_summary" TEXT,
    "session_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'started',
    "error_message" TEXT,
    "result_summary" TEXT,
    "wf_url" TEXT,
    "initial_estimated_hours" DOUBLE PRECISION,
    "estimated_hours" DOUBLE PRECISION,
    "questionnaire_data" JSONB,
    "estimate_data" JSONB,
    "staffing_snapshot" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staffing_plans" (
    "id" SERIAL NOT NULL,
    "activity_id" INTEGER NOT NULL,
    "total_weeks" DOUBLE PRECISION,
    "total_cost" DOUBLE PRECISION,
    "timeline" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staffing_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staffing_roles" (
    "id" SERIAL NOT NULL,
    "staffing_plan_id" INTEGER NOT NULL,
    "role_name" TEXT NOT NULL,
    "categories" TEXT,
    "hours_allocated" DOUBLE PRECISION,
    "headcount" INTEGER NOT NULL DEFAULT 1,
    "utilization" DOUBLE PRECISION NOT NULL DEFAULT 0.8,
    "duration_weeks" DOUBLE PRECISION,
    "rate" DOUBLE PRECISION,
    "cost" DOUBLE PRECISION,

    CONSTRAINT "staffing_roles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "activities_user_id_idx" ON "activities"("user_id");

-- CreateIndex
CREATE INDEX "activities_session_id_idx" ON "activities"("session_id");

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staffing_plans" ADD CONSTRAINT "staffing_plans_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "activities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staffing_roles" ADD CONSTRAINT "staffing_roles_staffing_plan_id_fkey" FOREIGN KEY ("staffing_plan_id") REFERENCES "staffing_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
