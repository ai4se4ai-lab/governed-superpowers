-- CreateEnum
CREATE TYPE "ProvenanceSource" AS ENUM ('human', 'ai_assumption', 'skill_doc', 'tool_output', 'existing_codebase', 'external_reference');

-- CreateEnum
CREATE TYPE "SubstateStatus" AS ENUM ('DONE', 'DONE_WITH_CONCERNS', 'BLOCKED');

-- CreateTable
CREATE TABLE "Project" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "consentScope" JSONB NOT NULL,
    "consentGrantedAt" TIMESTAMP(3) NOT NULL,
    "consentRecordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GraphSpec" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "specPath" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "planPath" TEXT,
    "lastPublishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GraphSpec_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GraphState" (
    "id" UUID NOT NULL,
    "specId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "summary" TEXT,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GraphState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GraphSubstate" (
    "id" UUID NOT NULL,
    "stateId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "status" "SubstateStatus",
    "changes" JSONB,
    "commits" TEXT[],
    "notes" TEXT,
    "humanCount" INTEGER NOT NULL DEFAULT 0,
    "aiCount" INTEGER NOT NULL DEFAULT 0,
    "groundedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GraphSubstate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GraphSource" (
    "id" UUID NOT NULL,
    "substateId" UUID NOT NULL,
    "marker" TEXT,
    "source" "ProvenanceSource" NOT NULL,
    "ref" TEXT,
    "text" TEXT,

    CONSTRAINT "GraphSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GraphStateEdge" (
    "id" UUID NOT NULL,
    "specId" UUID NOT NULL,
    "fromId" UUID NOT NULL,
    "toId" UUID NOT NULL,

    CONSTRAINT "GraphStateEdge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GraphSubstateEdge" (
    "id" UUID NOT NULL,
    "specId" UUID NOT NULL,
    "fromId" UUID NOT NULL,
    "toId" UUID NOT NULL,

    CONSTRAINT "GraphSubstateEdge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Project_userId_idx" ON "Project"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Project_userId_slug_key" ON "Project"("userId", "slug");

-- CreateIndex
CREATE INDEX "GraphSpec_projectId_idx" ON "GraphSpec"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "GraphSpec_projectId_specPath_key" ON "GraphSpec"("projectId", "specPath");

-- CreateIndex
CREATE INDEX "GraphState_specId_idx" ON "GraphState"("specId");

-- CreateIndex
CREATE UNIQUE INDEX "GraphState_specId_key_key" ON "GraphState"("specId", "key");

-- CreateIndex
CREATE INDEX "GraphSubstate_stateId_idx" ON "GraphSubstate"("stateId");

-- CreateIndex
CREATE UNIQUE INDEX "GraphSubstate_stateId_key_key" ON "GraphSubstate"("stateId", "key");

-- CreateIndex
CREATE INDEX "GraphSource_substateId_idx" ON "GraphSource"("substateId");

-- CreateIndex
CREATE INDEX "GraphStateEdge_specId_idx" ON "GraphStateEdge"("specId");

-- CreateIndex
CREATE UNIQUE INDEX "GraphStateEdge_fromId_toId_key" ON "GraphStateEdge"("fromId", "toId");

-- CreateIndex
CREATE INDEX "GraphSubstateEdge_specId_idx" ON "GraphSubstateEdge"("specId");

-- CreateIndex
CREATE UNIQUE INDEX "GraphSubstateEdge_fromId_toId_key" ON "GraphSubstateEdge"("fromId", "toId");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GraphSpec" ADD CONSTRAINT "GraphSpec_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GraphState" ADD CONSTRAINT "GraphState_specId_fkey" FOREIGN KEY ("specId") REFERENCES "GraphSpec"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GraphSubstate" ADD CONSTRAINT "GraphSubstate_stateId_fkey" FOREIGN KEY ("stateId") REFERENCES "GraphState"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GraphSource" ADD CONSTRAINT "GraphSource_substateId_fkey" FOREIGN KEY ("substateId") REFERENCES "GraphSubstate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GraphStateEdge" ADD CONSTRAINT "GraphStateEdge_specId_fkey" FOREIGN KEY ("specId") REFERENCES "GraphSpec"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GraphStateEdge" ADD CONSTRAINT "GraphStateEdge_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "GraphState"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GraphStateEdge" ADD CONSTRAINT "GraphStateEdge_toId_fkey" FOREIGN KEY ("toId") REFERENCES "GraphState"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GraphSubstateEdge" ADD CONSTRAINT "GraphSubstateEdge_specId_fkey" FOREIGN KEY ("specId") REFERENCES "GraphSpec"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GraphSubstateEdge" ADD CONSTRAINT "GraphSubstateEdge_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "GraphSubstate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GraphSubstateEdge" ADD CONSTRAINT "GraphSubstateEdge_toId_fkey" FOREIGN KEY ("toId") REFERENCES "GraphSubstate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

