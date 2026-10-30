import * as purchaseService from "../services/purchaseService.js";

export async function getAllPurchases(req, res) {
  try {
    const { phone } = req.query;
    const purchases = await purchaseService.getAllPurchases(phone);
    res.json({ success: true, purchases });
  } catch (err) {
    console.error("getAllPurchases error:", err);
    res.status(err.status || 500).json({ success: false, message: "Server error" });
  }
}

export async function listLearnerPurchases(req, res) {
  try {
    const { learnerId } = req.params;
    const purchases = await purchaseService.listLearnerPurchases(learnerId);
    res.json({ success: true, purchases });
  } catch (err) {
    console.error("listLearnerPurchases error:", err);
    res.status(err.status || 500).json({ success: false, message: "Server error" });
  }
}

export async function createNewPurchase(req, res) {
  try {
    const { learnerId, packageId, status } = req.body;
    const purchase = await purchaseService.createNewPurchase({ learnerId, packageId, status });
    res.status(201).json({ success: true, purchase });
  } catch (err) {
    console.error("createNewPurchase error:", err);
    res.status(err.status || 500).json({ success: false, message: "Server error" });
  }
}

export async function renewPurchaseController(req, res) {
  try {
    const { id } = req.params;
    const { extraDays } = req.body;
    const result = await purchaseService.renewPurchase(id, extraDays);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error("renewPurchaseController error:", err);
    res.status(err.status || 500).json({ success: false, message: err.message || "Server error" });
  }
}

export async function changePackageController(req, res) {
  try {
    const { purchaseId, newPackageId } = req.body;
    const result = await purchaseService.changePackage(purchaseId, newPackageId);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error("changePackageController error:", err);
    res.status(err.status || 500).json({ success: false, message: err.message || "Server error" });
  }
}

