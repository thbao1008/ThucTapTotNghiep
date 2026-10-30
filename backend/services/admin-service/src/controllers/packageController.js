import {
  createPackage,
  updatePackage,
  deletePackage,
  getAllPackages
} from "../models/packageModel.js";

function validatePackage(input, partial = false) {
  if ((!partial || input.name !== undefined) && (typeof input.name !== 'string' || !input.name.trim())) throw Object.assign(new Error('Tên gói không hợp lệ'), {status:400});
  for (const field of ['price','original_price','duration_days']) {
    if (partial && input[field] === undefined || field === 'original_price' && input[field] == null) continue;
    if (!Number.isSafeInteger(input[field]) || input[field] < (field === 'duration_days' ? 1 : 0) || input[field] > 2147483647) throw Object.assign(new Error('Giá hoặc thời hạn không hợp lệ'), {status:400});
  }
}

export async function createNewPackage(req, res) {
  try {
    validatePackage(req.body);
    const pkg = await createPackage(req.body);
    res.status(201).json(pkg);
  } catch (err) {
    console.error("❌ Lỗi POST package: - packageController.js:13", err);
    res.status(err.status || 500).json({ error: err.status ? err.message : "DB error" });
  }
}

export async function updateExistingPackage(req, res) {
  try {
    const { id } = req.params;
    validatePackage(req.body, true);
    const pkg = await updatePackage(id, req.body);
    if (!pkg) return res.status(404).json({error:'Không tìm thấy gói'});
    res.json(pkg);
  } catch (err) {
    console.error("❌ Lỗi PUT package: - packageController.js:24", err);
    res.status(err.status || 500).json({ error: err.status ? err.message : "DB error" });
  }
}

export async function deleteExistingPackage(req, res) {
  try {
    const { id } = req.params;
    if (!await deletePackage(id)) return res.status(404).json({error:'Không tìm thấy gói'});
    res.json({ success: true });
  } catch (err) {
    console.error("❌ Lỗi DELETE package: - packageController.js:35", err);
    res.status(err.code === '23503' ? 409 : 500).json({ error: err.code === '23503' ? 'Gói đã có đăng ký, cần giữ lịch sử học tập' : 'DB error' });
  }
}

export async function getPackages(req, res) {
  try {
    const pkgs = await getAllPackages();
    res.json(pkgs);
  } catch (err) {
    console.error("❌ Lỗi GET packages: - packageController.js:45", err);
    res.status(500).json({ error: "DB error" });
  }
}
