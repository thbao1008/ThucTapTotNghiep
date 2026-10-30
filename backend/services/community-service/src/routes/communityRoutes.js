import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import * as communityCtrl from "../controllers/communityController.js";
import { authGuard, adminGuard } from "../middleware/authGuard.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

/**
 * Tìm project root (đi lên từ community-service/src/routes đến root)
 */
function getProjectRoot() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  // __dirname = backend/services/community-service/src/routes
  // Đi lên 3 cấp: routes -> src -> community-service -> services -> backend
  return path.resolve(__dirname, "..", "..", "..", "..");
}

// Ensure uploads directory exists at backend/uploads
const backendDir = getProjectRoot();
const uploadsDir = path.resolve(backendDir, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + "-" + uniqueSuffix + ext);
  }
});

const upload = multer({ storage: storage });

router.post("/posts", authGuard, upload.fields([{ name: 'audio', maxCount: 1 }, { name: 'image', maxCount: 1 }, { name: 'video', maxCount: 1 }]), communityCtrl.createPost);
router.get("/posts", authGuard, communityCtrl.getPosts);
router.get("/posts/my-posts", authGuard, communityCtrl.getUserPosts);
router.get("/posts/liked", authGuard, communityCtrl.getLikedPosts);
router.get("/posts/pending", authGuard, adminGuard, communityCtrl.getPendingPosts);
router.get("/posts/:id", authGuard, communityCtrl.getPostById);
router.post("/posts/:postId/view", authGuard, communityCtrl.markPostViewed);
router.post("/posts/:id/review", authGuard, adminGuard, communityCtrl.reviewPost);
router.delete("/posts/:id", authGuard, communityCtrl.deletePost);
router.patch("/posts/:id/pin", authGuard, adminGuard, communityCtrl.togglePinPost);

router.post("/posts/:postId/comments", authGuard, communityCtrl.readablePostGuard, upload.single('audio'), communityCtrl.createComment);
router.get("/posts/:postId/comments", authGuard, communityCtrl.readablePostGuard, communityCtrl.getComments);
router.delete("/comments/:id", authGuard, communityCtrl.deleteComment);

router.post("/likes", authGuard, communityCtrl.toggleLike);

export default router;

