export const errorHandler = (err, req, res, next) => {
    console.error(err);
    res.status(err.statusCode || 500).json({
        success: false,
        error: { message: err.message || 'Internal server error' },
    });
};