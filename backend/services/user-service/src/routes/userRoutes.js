import express from "express";
import * as userCtrl from "../controllers/userController.js";
import { authGuard, adminGuard } from "../middleware/authGuard.js";

const router = express.Router();

// Route cho user quản lý profile của chính họ (không cần admin)
// Route này được mount tại /users trong server.js, nên path là /me/...
router.get("/me", authGuard, userCtrl.getMyProfile);
router.get("/me/package", authGuard, userCtrl.getMyPackage);
router.post("/me/avatar", authGuard, userCtrl.uploadAvatarMiddleware.single("avatar"), userCtrl.uploadMyAvatar);

// Routes yêu cầu admin (đặt sau route /me để không bị conflict)
// Route này được mount tại /admin trong server.js, nên path là /users/...
router.use(authGuard, adminGuard);

router.get("/users", userCtrl.listUsers);
router.get("/users/:id", userCtrl.getUser);
router.post("/users", userCtrl.createUser);
router.put("/users/:id", userCtrl.updateUser);
router.delete("/users/:id", userCtrl.deleteUser);
router.put("/users/:id/status", userCtrl.toggleUserStatus);
router.post("/users/:id/avatar", userCtrl.uploadAvatarMiddleware.single("avatar"), userCtrl.uploadAvatar);

export default router;

