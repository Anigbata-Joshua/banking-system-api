export const errorHandler = (err, req, res, next) => {
    console.error(err);

    if (err.name === 'ValidationError') {
        return res.status(400).json({
            success: false,
            error: { message: err.message },
        });
    }

    if (err.code === 11000) {
        return res.status(400).json({
            success: false,
            error: { message: 'A record with that value already exists' },
        });
    }
    // A malformed ObjectId in a route param (e.g. GET /loans/not-a-valid-id) throws
    // Mongoose's CastError, whose message includes internal details — the model name,
    // the schema path, the type it tried to cast to. That's implementation detail that
    // shouldn't reach an API consumer, and the error was previously falling through to
    // an unhandled 500. A malformed ID is a client input problem, so it's a clean 400
    // with a generic message instead.
    if (err.name === 'CastError') {
        return res.status(400).json({
            success: false,
            error: { message: 'Invalid ID format' },
        });
    }

    res.status(err.statusCode || 500).json({
        success: false,
        error: { message: err.message || 'Internal server error' },
    });
};