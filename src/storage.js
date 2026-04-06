const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

const LOCAL_UPLOAD_DIR = path.join(__dirname, "..", "data", "uploads");

function ensureLocalUploadDir() {
  if (!fs.existsSync(LOCAL_UPLOAD_DIR)) {
    fs.mkdirSync(LOCAL_UPLOAD_DIR, { recursive: true });
  }
}

function sanitizeFilename(filename) {
  const name = String(filename || "resume").trim() || "resume";
  return name.replace(/[^a-z0-9._-]+/gi, "-");
}

function getS3Config() {
  return {
    bucket: String(process.env.AWS_S3_BUCKET || "").trim(),
    region: String(process.env.AWS_REGION || "").trim(),
    accessKeyId: String(process.env.AWS_ACCESS_KEY_ID || "").trim(),
    secretAccessKey: String(process.env.AWS_SECRET_ACCESS_KEY || "").trim(),
    publicBaseUrl: String(process.env.AWS_S3_PUBLIC_BASE_URL || "").trim().replace(/\/+$/, "")
  };
}

function createS3Client(config) {
  return new S3Client({
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey
    }
  });
}

async function storeUploadedFile(file, options = {}) {
  if (!file?.fileData) {
    throw new Error("Missing uploaded file data.");
  }

  const filename = sanitizeFilename(file.filename || options.filename || "resume.bin");
  const mimeType = String(file.mimeType || "application/octet-stream").trim();
  const buffer = Buffer.from(String(file.fileData || ""), "base64");
  const objectPrefix = String(options.objectPrefix || "applicants").replace(/^\/+|\/+$/g, "");
  const objectKey = `${objectPrefix}/${Date.now()}-${crypto.randomUUID()}-${filename}`;
  const config = getS3Config();

  if (config.bucket && config.region && config.accessKeyId && config.secretAccessKey) {
    const client = createS3Client(config);
    await client.send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: objectKey,
        Body: buffer,
        ContentType: mimeType
      })
    );

    const fileUrl = config.publicBaseUrl
      ? `${config.publicBaseUrl}/${objectKey}`
      : `https://${config.bucket}.s3.${config.region}.amazonaws.com/${objectKey}`;

    return {
      provider: "s3",
      key: objectKey,
      url: fileUrl,
      mimeType,
      filename,
      sizeBytes: buffer.length
    };
  }

  ensureLocalUploadDir();
  const localPath = path.join(LOCAL_UPLOAD_DIR, `${Date.now()}-${crypto.randomUUID()}-${filename}`);
  fs.writeFileSync(localPath, buffer);
  return {
    provider: "local",
    key: path.basename(localPath),
    url: localPath,
    mimeType,
    filename,
    sizeBytes: buffer.length
  };
}

module.exports = {
  storeUploadedFile
};
