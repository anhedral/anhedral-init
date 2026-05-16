import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

type UploadObjectInput = {
  objectKey: string;
  contentType: string;
};

function hasR2Config() {
  return Boolean(
    process.env.R2_ACCOUNT_ID
    && process.env.R2_ACCESS_KEY_ID
    && process.env.R2_SECRET_ACCESS_KEY
    && process.env.R2_BUCKET
  );
}

function getR2Client() {
  if (!hasR2Config()) {
    throw new Error('R2 is not configured');
  }

  return new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
    },
  });
}

function getBucket() {
  if (!process.env.R2_BUCKET) {
    throw new Error('R2_BUCKET is not configured');
  }

  return process.env.R2_BUCKET;
}

export function isR2Configured() {
  return hasR2Config();
}

export async function createSignedUploadUrl(input: UploadObjectInput, expiresIn = 60 * 10) {
  const client = getR2Client();
  const bucket = getBucket();

  const uploadUrl = await getSignedUrl(client, new PutObjectCommand({
    Bucket: bucket,
    Key: input.objectKey,
    ContentType: input.contentType,
  }), { expiresIn });

  return {
    bucket,
    objectKey: input.objectKey,
    uploadUrl,
    expiresIn,
  };
}

export async function createSignedDownloadUrl(objectKey: string, expiresIn = 60 * 10) {
  const client = getR2Client();
  const downloadUrl = await getSignedUrl(client, new GetObjectCommand({
    Bucket: getBucket(),
    Key: objectKey,
  }), { expiresIn });

  return { objectKey, downloadUrl, expiresIn };
}

export async function deleteObjectFromR2(objectKey: string) {
  const client = getR2Client();
  await client.send(new DeleteObjectCommand({
    Bucket: getBucket(),
    Key: objectKey,
  }));
}
