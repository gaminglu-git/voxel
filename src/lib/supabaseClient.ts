import { createClient } from '@supabase/supabase-js'
import { supabaseUrl, supabaseAnonKey } from '$lib/stores/supabase'

let url = ''
supabaseUrl.subscribe(value => {
  url = value
})

let anonKey = ''
supabaseAnonKey.subscribe(value => {
  anonKey = value
})

export const supabase = createClient(url, anonKey)
