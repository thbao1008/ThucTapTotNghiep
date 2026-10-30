import pool from '../config/db.js';
import {listPurchaseLedger,addPurchase} from '../../../shared/purchaseLedger.js';
export const getAllPurchases = phone => listPurchaseLedger(pool,{phone});
export const listLearnerPurchases = learnerId => listPurchaseLedger(pool,{learnerId});
export const createNewPurchase = input => addPurchase(pool,input);
export const renewPurchase = purchaseId => addPurchase(pool,{renewPurchaseId:purchaseId});
export async function changePackage(purchaseId,newPackageId){
 const {rows:[old]}=await pool.query('SELECT learner_id FROM purchases WHERE id=$1',[purchaseId]);
 if(!old)throw Object.assign(new Error('Không tìm thấy lượt đăng ký'),{status:404});
 return addPurchase(pool,{learnerId:old.learner_id,packageId:newPackageId});
}
