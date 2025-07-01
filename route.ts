import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { supabase } from "@/lib/supabase";

export const createProfileProcedure = publicProcedure
  .input(z.object({ 
    userId: z.string(),
    username: z.string(),
    phone: z.string().optional(),
    email: z.string().optional(),
    profilePicture: z.string().optional(),
  }))
  .mutation(async ({ input }) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .upsert({
          id: input.userId,
          username: input.username,
          phone: input.phone || null,
          email: input.email || null,
          profile_picture: input.profilePicture,
          has_completed_onboarding: true,
          xp: 0,
          nights_out: 0,
          bars_hit: 0,
          drunk_scale_ratings: [],
          total_shots: 0,
          total_scoop_and_scores: 0,
          total_beers: 0,
          total_beer_towers: 0,
          total_funnels: 0,
          total_shotguns: 0,
          pool_games_won: 0,
          dart_games_won: 0,
          photos_taken: 0,
          xp_activities: [],
          visited_bars: [],
          daily_stats: {},
        })
        .select()
        .single();

      if (error) {
        console.error('Supabase error:', error);
        return {
          success: false,
          error: error.message,
          message: 'Failed to create profile'
        };
      }

      console.log('User profile created/updated in Supabase:', data);
      
      return {
        success: true,
        profileId: data.id,
        message: 'Profile created successfully'
      };
    } catch (error) {
      console.error('Error creating profile:', error);
      return {
        success: false,
        error: 'Internal server error',
        message: 'Failed to create profile'
      };
    }
  });

export default createProfileProcedure;