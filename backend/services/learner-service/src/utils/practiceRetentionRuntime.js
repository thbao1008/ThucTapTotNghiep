import pool from '../config/db.js';
import {createPracticeRetention} from './practiceSessionEnd.js';

export const practiceRetention=createPracticeRetention({database:pool});
