import pool from '../config/db.js';
import {listPurchaseLedger,addPurchase} from '../../../shared/purchaseLedger.js';
function fail(res,error){return res.status(error.status||500).json({success:false,message:error.status?error.message:'Không thể xử lý gói học'});}
export async function getAllPurchases(req,res){try{return res.json({success:true,purchases:await listPurchaseLedger(pool,{phone:req.query.phone})});}catch(error){return fail(res,error);}}
export async function listLearnerPurchases(req,res){try{return res.json({success:true,purchases:await listPurchaseLedger(pool,{learnerId:req.params.learnerId})});}catch(error){return fail(res,error);}}
export async function createNewPurchase(req,res){try{return res.status(201).json({success:true,purchase:await addPurchase(pool,req.body)});}catch(error){return fail(res,error);}}
export async function renewPurchaseController(req,res){try{return res.json({success:true,purchase:await addPurchase(pool,{renewPurchaseId:req.params.id}),message:'Gia hạn thành công'});}catch(error){return fail(res,error);}}
export async function changePackageController(req,res){try{return res.json({success:true,purchase:await addPurchase(pool,{learnerId:req.body.learnerId,packageId:req.body.newPackageId}),message:'Đăng ký gói thành công'});}catch(error){return fail(res,error);}}
