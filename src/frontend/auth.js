/**
 * AuthManager - JML MES Security Engine
 * Strictly separated from UI logic to prevent regressions.
 */
class AuthManager {
    constructor(supabaseClient) {
        this.supabase = supabaseClient;
        this.user = null;
        this.profile = null;
    }

    async getSession() {
        const { data: { session } } = await this.supabase.auth.getSession();
        return session;
    }

    async signIn(email, password) {
        return await this.supabase.auth.signInWithPassword({ email, password });
    }

    async signOut() {
        await this.supabase.auth.signOut();
        location.reload();
    }

    async getProfile(userId) {
        const { data: profile } = await this.supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();
        
        let role = profile?.role || 'operator';
        // Auto-assign super_admin role for JML emails
        const { data: { user } } = await this.supabase.auth.getUser();
        if (user?.email?.endsWith('@jml.com')) role = 'super_admin';
        
        this.profile = { ...profile, role };
        return this.profile;
    }

    getRoleLabels() {
        return {
            'super_admin': 'System Master',
            'admin': 'Partner Admin',
            'operator': 'Field Operator'
        };
    }

    onAuthStateChange(callback) {
        this.supabase.auth.onAuthStateChange((event, session) => {
            callback(event, session);
        });
    }
}
