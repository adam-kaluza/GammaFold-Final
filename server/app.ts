import express from 'express';
import { SYNTHETIC_CAMPAIGNS } from '../src/domain/campaigns.ts';
import { computeDeterministicSummary } from '../src/domain/checks.ts';
import {
  computeEvidenceHash,
  SYNTHETIC_EVIDENCE_PACKET,
  verifyFrozenPacketIntegrity,
} from '../src/domain/packet.ts';
import {
  isJsonContentTypeHeader,
  isLoopbackRemoteAddress,
  MAX_REQUEST_BODY_LIMIT,
  REQUIRED_CARBON_MODEL_ID,
  validateLoopbackHostHeader,
  validateReviewRequestOrigin,
} from './config.ts';
import { defaultReviewService, type ReviewService } from './geminiService.ts';

export interface CreateApiAppOptions {
  reviewService?: ReviewService;
  bodyLimit?: string;
}

interface ReviewTrackedRequest extends express.Request {
  rawJsonTrimmedLength?: number;
}

function isPlainJsonObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

export function createApiApp(options: CreateApiAppOptions = {}): express.Express {
  const reviewService = options.reviewService ?? defaultReviewService;
  const bodyLimit = options.bodyLimit ?? MAX_REQUEST_BODY_LIMIT;

  const app = express();
  app.disable('x-powered-by');

  const reviewJsonParser = express.json({
    limit: bodyLimit,
    type: () => true,
    verify: (req, _res, buf) => {
      (req as ReviewTrackedRequest).rawJsonTrimmedLength = buf.toString('utf8').trim().length;
    },
  });

  app.use('/api', (req, res, next) => {
    if (!isLoopbackRemoteAddress(req.socket?.remoteAddress)) {
      res.status(403).json({
        errorCode: 'UNSAFE_HOST_BINDING',
        message:
          'Local API endpoints are restricted to loopback connections (127.0.0.1 / ::1). Public unauthenticated access is prohibited.',
        requestedModel: REQUIRED_CARBON_MODEL_ID,
        returnedModelVersion: null,
        runtimeAccessProven: false,
        statusNote: 'Blocked non-loopback socket connection to temporary event runtime.',
        timestamp: new Date().toISOString(),
        httpStatus: 403,
        evidenceHash: computeEvidenceHash(SYNTHETIC_EVIDENCE_PACKET),
      });
      return;
    }

    const hostCheck = validateLoopbackHostHeader(req.headers.host, req.socket?.localPort);
    if (!hostCheck.ok) {
      res.status(403).json({
        errorCode: 'UNSAFE_HOST_BINDING',
        message:
          'Request Host header must match the local loopback server authority (127.0.0.1, localhost, or [::1]).',
        requestedModel: REQUIRED_CARBON_MODEL_ID,
        returnedModelVersion: null,
        runtimeAccessProven: false,
        statusNote: 'Blocked untrusted or rebinding-like Host header before service execution.',
        timestamp: new Date().toISOString(),
        httpStatus: 403,
        evidenceHash: computeEvidenceHash(SYNTHETIC_EVIDENCE_PACKET),
      });
      return;
    }

    next();
  });

  app.options('/api/review', (_req, res) => {
    res.status(403).end();
  });

  app.get('/api/packet', (_req, res) => {
    const evidenceHash = computeEvidenceHash(SYNTHETIC_EVIDENCE_PACKET);
    res.json({
      application: 'GammaFold',
      campaigns: SYNTHETIC_CAMPAIGNS,
      packet: SYNTHETIC_EVIDENCE_PACKET,
      deterministicChecks: computeDeterministicSummary(SYNTHETIC_EVIDENCE_PACKET),
      evidenceHash,
      sourceImmutableVerified: verifyFrozenPacketIntegrity(SYNTHETIC_EVIDENCE_PACKET),
    });
  });

  app.get('/api/model-status', (_req, res) => {
    res.json(reviewService.getModelStatus());
  });

  app.post(
    '/api/review',
    (req, res, next) => {
      const hostCheck = validateLoopbackHostHeader(req.headers.host, req.socket?.localPort);
      if (!hostCheck.ok) {
        res.status(403).json({
          errorCode: 'UNSAFE_HOST_BINDING',
          message:
            'Request Host header must match the local loopback server authority (127.0.0.1, localhost, or [::1]).',
          requestedModel: REQUIRED_CARBON_MODEL_ID,
          returnedModelVersion: null,
          runtimeAccessProven: false,
          statusNote: 'Blocked untrusted or rebinding-like Host header before service execution.',
          timestamp: new Date().toISOString(),
          httpStatus: 403,
          evidenceHash: computeEvidenceHash(SYNTHETIC_EVIDENCE_PACKET),
        });
        return;
      }

      const originCheck = validateReviewRequestOrigin(
        {
          origin: req.headers.origin,
          secFetchSite: req.headers['sec-fetch-site'],
          referer: req.headers.referer,
        },
        hostCheck.expectedOrigin,
      );
      if (!originCheck.ok) {
        res.status(403).json({
          errorCode: 'FORBIDDEN_ORIGIN',
          message:
            'Cross-origin or untrusted browser requests to POST /api/review are prohibited. Use the same-origin local workbench or an authorized direct local JSON client.',
          requestedModel: REQUIRED_CARBON_MODEL_ID,
          returnedModelVersion: null,
          runtimeAccessProven: false,
          statusNote: 'Blocked cross-origin or null-origin request before service execution.',
          timestamp: new Date().toISOString(),
          httpStatus: 403,
          evidenceHash: computeEvidenceHash(SYNTHETIC_EVIDENCE_PACKET),
        });
        return;
      }

      if (!isJsonContentTypeHeader(req.headers['content-type'])) {
        res.status(415).json({
          errorCode: 'UNSUPPORTED_MEDIA_TYPE',
          message: 'POST /api/review requires Content-Type: application/json with a JSON object body.',
          requestedModel: REQUIRED_CARBON_MODEL_ID,
          returnedModelVersion: null,
          runtimeAccessProven: false,
          statusNote: 'Rejected non-JSON Content-Type before body parsing or service execution.',
          timestamp: new Date().toISOString(),
          httpStatus: 415,
          evidenceHash: computeEvidenceHash(SYNTHETIC_EVIDENCE_PACKET),
        });
        return;
      }

      next();
    },
    reviewJsonParser,
    async (req, res) => {
      const rawLen = (req as ReviewTrackedRequest).rawJsonTrimmedLength ?? 0;
      if (rawLen === 0 || !isPlainJsonObject(req.body)) {
        res.status(400).json({
          errorCode: 'BAD_REQUEST',
          message: 'Request body must be a non-empty JSON object.',
          requestedModel: REQUIRED_CARBON_MODEL_ID,
          returnedModelVersion: null,
          runtimeAccessProven: false,
          statusNote: 'Rejected empty or non-object JSON request payload.',
          timestamp: new Date().toISOString(),
          httpStatus: 400,
          evidenceHash: computeEvidenceHash(SYNTHETIC_EVIDENCE_PACKET),
        });
        return;
      }

      const body = req.body;
      const allowedKeys = new Set(['campaignId', 'modelId']);
      for (const key of Object.keys(body)) {
        if (!allowedKeys.has(key)) {
          res.status(400).json({
            errorCode: 'BAD_REQUEST',
            message: 'Unsupported request field supplied. Server reviews only the frozen packet.',
            requestedModel: REQUIRED_CARBON_MODEL_ID,
            returnedModelVersion: null,
            runtimeAccessProven: false,
            statusNote: 'Rejected unexpected client field; client cannot mutate source packet.',
            timestamp: new Date().toISOString(),
            httpStatus: 400,
            evidenceHash: computeEvidenceHash(SYNTHETIC_EVIDENCE_PACKET),
          });
          return;
        }
      }

      if (body.campaignId !== undefined && typeof body.campaignId !== 'string') {
        res.status(400).json({
          errorCode: 'BAD_REQUEST',
          message: 'Field "campaignId" must be a string when supplied.',
          requestedModel: REQUIRED_CARBON_MODEL_ID,
          returnedModelVersion: null,
          runtimeAccessProven: false,
          statusNote: 'Invalid campaignId type.',
          timestamp: new Date().toISOString(),
          httpStatus: 400,
          evidenceHash: computeEvidenceHash(SYNTHETIC_EVIDENCE_PACKET),
        });
        return;
      }

      if (body.modelId !== undefined && typeof body.modelId !== 'string') {
        res.status(400).json({
          errorCode: 'BAD_REQUEST',
          message: 'Field "modelId" must be a string when supplied.',
          requestedModel: REQUIRED_CARBON_MODEL_ID,
          returnedModelVersion: null,
          runtimeAccessProven: false,
          statusNote: 'Invalid modelId type.',
          timestamp: new Date().toISOString(),
          httpStatus: 400,
          evidenceHash: computeEvidenceHash(SYNTHETIC_EVIDENCE_PACKET),
        });
        return;
      }

      const result = await reviewService.executeEvidenceReview({
        campaignId: body.campaignId as string | undefined,
        modelId: body.modelId as string | undefined,
      });
      res.status(result.status).json(result.body);
    },
  );

  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      next: express.NextFunction,
    ) => {
      if (err && typeof err === 'object' && 'type' in err) {
        const errType = (err as { type?: string }).type;
        if (errType === 'entity.too.large') {
          res.status(413).json({
            errorCode: 'BAD_REQUEST',
            message: 'Request payload exceeds the 16KB server limit.',
            requestedModel: REQUIRED_CARBON_MODEL_ID,
            returnedModelVersion: null,
            runtimeAccessProven: false,
            statusNote: 'Oversized request rejected.',
            timestamp: new Date().toISOString(),
            httpStatus: 413,
            evidenceHash: computeEvidenceHash(SYNTHETIC_EVIDENCE_PACKET),
          });
          return;
        }
        if (errType === 'entity.parse.failed') {
          res.status(400).json({
            errorCode: 'BAD_REQUEST',
            message: 'Malformed JSON in request body.',
            requestedModel: REQUIRED_CARBON_MODEL_ID,
            returnedModelVersion: null,
            runtimeAccessProven: false,
            statusNote: 'Malformed client JSON rejected.',
            timestamp: new Date().toISOString(),
            httpStatus: 400,
            evidenceHash: computeEvidenceHash(SYNTHETIC_EVIDENCE_PACKET),
          });
          return;
        }
      }
      next(err);
    },
  );

  return app;
}
