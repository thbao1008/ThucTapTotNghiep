import { authGuard } from "./authGuard.js";
import { packageGuard } from "./packageGuard.js";

export async function authAndPackageGuard(req, res, next) {
  // First check authentication
  await new Promise((resolve, reject) => {
    const originalNext = () => resolve();
    const originalRes = {
      ...res,
      status: (code) => ({
        json: (data) => {
          res.status(code).json(data);
          reject(new Error('Auth failed'));
        }
      })
    };

    // Temporarily replace res methods
    const tempAuthGuard = async (req, tempRes, next) => {
      try {
        await authGuard(req, tempRes, next);
      } catch (err) {
        reject(err);
      }
    };

    tempAuthGuard(req, originalRes, originalNext);
  });

  // If we get here, auth passed. Now check package for non-dashboard routes
  const isDashboardRoute = req.path.includes('/progress-analytics') ||
                          req.path.includes('/by-user/') ||
                          req.path === '/';

  if (!isDashboardRoute) {
    await new Promise((resolve, reject) => {
      const originalNext = () => resolve();
      const originalRes = {
        ...res,
        status: (code) => ({
          json: (data) => {
            res.status(code).json(data);
            reject(new Error('Package check failed'));
          }
        })
      };

      const tempPackageGuard = async (req, tempRes, next) => {
        try {
          await packageGuard(req, tempRes, next);
        } catch (err) {
          reject(err);
        }
      };

      tempPackageGuard(req, originalRes, originalNext);
    });
  }

  // If we get here, all checks passed
  next();
}