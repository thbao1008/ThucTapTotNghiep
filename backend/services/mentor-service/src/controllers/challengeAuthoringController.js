import pool from '../config/db.js';
import {createChallengeAuthoring} from '../services/challengeAuthoring.js';

const authoring = createChallengeAuthoring({pool});
function handle(operation, status) {
  return async (req,res) => {
    try { return res.status(status).json({challenge:await operation(req)}); }
    catch (error) {
      if (error.status) return res.status(error.status).json({code:error.code,message:error.message,...(error.similarity?{similarity:error.similarity}:{})});
      if (['55P03','57014','40P01'].includes(error.code)) return res.status(409).json({message:'Challenge is busy. Please try again.'});
      console.error('Unable to save Mentor challenge:', error.code || error.name);
      return res.status(503).json({message:'Unable to save challenge. Please try again.'});
    }
  };
}
export const createChallenge = handle(req=>authoring.create(req.mentorId,req.user.id,req.body),201);
export const updateChallenge = handle(req=>authoring.update(req.mentorId,Number(req.params.id),req.body),200);
export async function checkChallenges(req,res) {
  try{return res.json(await authoring.check(req.mentorId,req.body));}
  catch(error){return res.status(error.status||503).json({code:error.code,message:error.status?error.message:'Unable to check similar challenges. Please try again.'});}
}
