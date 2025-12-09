import { supabase } from './server/supabaseDB.js';

async function checkPrefs() {
    console.log('Checking user preferences...');
    const userId = 'default_user';

    // 1. Get current prefs
    const { data: current, error } = await supabase
        .from('user_preferences')
        .select('*')
        .eq('user_id', userId)
        .single();

    if (error) {
        console.error('Error fetching prefs:', error);
        return;
    }

    console.log('Current prefs:', current);

    // 2. Try to update with a new field 'test_field'
    console.log('Attempting to update with arbitrary field...');
    const { data: updated, error: updateError } = await supabase
        .from('user_preferences')
        .update({ test_field: 'test_value', folders: [] })
        .eq('user_id', userId)
        .select()
        .single();

    if (updateError) {
        console.error('Update failed (likely strict schema):', updateError.message);
    } else {
        console.log('Update successful! Table supports arbitrary fields or has these columns.');
        console.log('Updated prefs:', updated);

        // Cleanup
        await supabase.from('user_preferences').update({ test_field: null, folders: null }).eq('user_id', userId);
    }
}

checkPrefs();
