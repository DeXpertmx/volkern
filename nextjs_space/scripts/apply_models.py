import re

with open("prisma/schema.prisma", "r") as f:
    content = f.read()

new_models = """
model SocialAnalytics {
  id              String     @id @default(cuid())
  postId          String     @unique
  views           Int        @default(0)
  likes           Int        @default(0)
  comments        Int        @default(0)
  shares          Int        @default(0)
  clicks          Int        @default(0)
  engagementRate  Float      @default(0)
  lastUpdated     DateTime   @default(now())
  post            SocialPost @relation(fields: [postId], references: [id], onDelete: Cascade)

  @@map("social_analytics")
}

model ContentAsset {
  id              String   @id @default(cuid())
  tenantId        String
  url             String?
  externalUrl     String?  
  type            String   
  tags            String[]
  metadata        Json?
  createdAt       DateTime @default(now())
  tenant          Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@index([tenantId])
  @@map("content_assets")
}

model WebForm {
  id              String              @id @default(cuid())
  tenantId        String
  name            String
  pageId          String?
  config          Json
  createdAt       DateTime            @default(now())
  updatedAt       DateTime            @updatedAt
  submissions     WebFormSubmission[]
  page            Page?               @relation(fields: [pageId], references: [id])
  tenant          Tenant              @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@index([tenantId])
  @@index([pageId])
  @@map("web_forms")
}

model WebFormSubmission {
  id              String   @id @default(cuid())
  formId          String
  leadId          String?
  payload         Json
  ipAddress       String?
  userAgent       String?
  createdAt       DateTime @default(now())
  form            WebForm  @relation(fields: [formId], references: [id], onDelete: Cascade)

  @@index([formId])
  @@index([leadId])
  @@map("web_form_submissions")
}
"""

if "model SocialAnalytics" not in content:
    content += "\n" + new_models

def replace_model(model_name, new_fields, current_content):
    pattern = r'(model ' + model_name + r' \{[^}]+?)\}'
    def replacer(match):
        inner = match.group(1)
        for field in new_fields:
            if field.split()[0] not in inner:
                inner += "  " + field + "\n"
        return inner + "}"
    return re.sub(pattern, replacer, current_content, count=1)

content = replace_model("Tenant", ["contentAssets ContentAsset[]", "webForms WebForm[]"], content)
content = replace_model("SocialPost", ["analytics SocialAnalytics?"], content)
content = replace_model("Page", ["webForms WebForm[]"], content)

with open("prisma/schema.prisma", "w") as f:
    f.write(content)

print("Done")
