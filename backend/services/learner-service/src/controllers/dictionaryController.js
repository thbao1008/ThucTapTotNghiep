import pool from '../config/db.js';
import {consumeDictionaryLookup} from '../utils/dictionaryLookupQuota.js';
import {callGroq} from '../utils/aiServiceClient.js';
import {createDictionaryHandler} from './dictionaryHandler.js';
export const getWordDefinition=createDictionaryHandler({database:pool,callAI:callGroq,consume:consumeDictionaryLookup});
