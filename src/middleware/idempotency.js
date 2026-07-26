import Idempotency from '../models/idempotency.model.js';

export async function enforceIdempotency(req, res, next) {
    const key = req.headers['idempotency-key'];

    if (!key) {
        return res.status(400).json({
            success: false,
            message: 'Idempotency-Key header is required',
        });
    }

    let record;
    try {
        record = await Idempotency.create({ key });
    } catch (error) {
        // Duplicate key — this request has already been claimed (or completed)
        const existing = await Idempotency.findOne({ key });

        if (existing && existing.response) {
            // Original request already finished — return its saved result
            return res.status(existing.statusCode).json(existing.response);
        }

        // Original request is still in progress — nothing to return yet
        return res.status(409).json({
            success: false,
            message: 'A request with this idempotency key is still being processed',
        });
    }

    // New key — let the request through, but intercept res.json so we can
    // save the eventual result onto this record afterward.
    const originalJson = res.json.bind(res);
    res.json = (body) => {
        Idempotency.findByIdAndUpdate(record._id, {
            statusCode: res.statusCode,
            response: body,
        }).catch((err) => console.error('Failed to save idempotency record:', err));

        return originalJson(body);
    };

    next();
}