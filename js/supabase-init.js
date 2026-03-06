// 1. Supabase 项目配置
const SUPABASE_URL = 'https://rqpqgpckotosjuiiqkit.supabase.co';
const SUPABASE_KEY = 'sb_publishable_iWPs_iamFCLEaDAOpmkLyw_eIXf7YBx';

const { createClient } = window.supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);