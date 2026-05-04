/**
 * APIManager - JML MES Data Engine
 */
class APIManager {
    constructor(supabaseClient) {
        this.supabase = supabaseClient;
    }

    async getPartners() {
        const { data: allPartners } = await this.supabase.from('partners').select('*');
        return allPartners || [];
    }

    async getPartnerById(partnerId) {
        const { data: partner } = await this.supabase
            .from('partners')
            .select('*')
            .eq('id', partnerId)
            .single();
        return partner;
    }

    async getProductionData(partnerId, mode, date) {
        let query = this.supabase.from('production_actuals').select('*').eq('partner_id', partnerId);
        
        if (mode === 'monthly') {
            const [year, month] = date.split('-');
            query = query.gte('work_date', `${year}-${month}-01`).lte('work_date', `${year}-${month}-31`);
        } else if (mode === 'yearly') {
            const year = date.split('-')[0];
            query = query.gte('work_date', `${year}-01-01`).lte('work_date', `${year}-12-31`);
        } else {
            query = query.eq('work_date', date);
        }

        const { data, error } = await query.order('work_date', { ascending: true });
        if (error) throw error;
        return data;
    }

    async getQualityHistory(partnerId, limit = 100) {
        const { data, error } = await this.supabase
            .from('production_actuals')
            .select('*')
            .eq('partner_id', partnerId)
            .order('work_date', { ascending: false })
            .limit(limit);
        if (error) throw error;
        return data;
    }
}
