const fs = require('fs');
let schema = fs.readFileSync('prisma/schema.prisma', 'utf8');

const newModels = `
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
  externalUrl     String?  // Reference to external cloud storage for heavy videos
  type            String   // IMAGE, VIDEO, DOCUMENT
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
`;

if (!schema.includes('model SocialAnalytics')) {
  schema += '\\n' + newModels;
}

// Add back relations safely using string replacement

// SocialPost -> SocialAnalytics
schema = schema.replace(
  /model SocialPost \{([^}]+?)\}/,
  (match, p1) => {
    if (!p1.includes('analytics ')) {
      return \`model SocialPost {\${p1}  analytics SocialAnalytics?\\n}\`;
    }
    return match;
  }
);

// Page -> WebForm
schema = schema.replace(
  /model Page \{([^}]+?)\}/,
  (match, p1) => {
    if (!p1.includes('webForms ')) {
      return \`model Page {\${p1}  webForms WebForm[]\\n}\`;
    }
    return match;
  }
);

// Tenant -> ContentAsset, WebForm, WebFormSubmission
schema = schema.replace(
  /model Tenant \{([^}]+?)\}/,
  (match, p1) => {
    if (!p1.includes('contentAssets ')) {
      return \`model Tenant {\${p1}  contentAssets ContentAsset[]\\n  webForms WebForm[]\\n}\`;
    }
    return match;
  }
);

fs.writeFileSync('prisma/schema.prisma', schema);
