-- CreateTable
CREATE TABLE "PackingTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tripId" TEXT NOT NULL,

    CONSTRAINT "PackingTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackingTemplateItem" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "PackingCategory" NOT NULL DEFAULT 'OTHER',
    "templateId" TEXT NOT NULL,

    CONSTRAINT "PackingTemplateItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PackingTemplate_tripId_idx" ON "PackingTemplate"("tripId");

-- CreateIndex
CREATE INDEX "PackingTemplateItem_templateId_idx" ON "PackingTemplateItem"("templateId");

-- AddForeignKey
ALTER TABLE "PackingTemplate" ADD CONSTRAINT "PackingTemplate_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackingTemplateItem" ADD CONSTRAINT "PackingTemplateItem_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "PackingTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
