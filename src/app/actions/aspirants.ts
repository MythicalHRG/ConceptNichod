"use server";
import { cookies } from "next/headers";
import dbConnect from "@/lib/mongoose";
import User from "@/models/User";
import { verifySessionCookie } from "@/lib/session";

export type SearchFilters = {
    searchQuery?: string;
    classLevel?: string;
    city?: string;
};

export async function searchAspirantsAction(filters: SearchFilters) {
    await dbConnect();
    const rawSession = cookies().get("user_session")?.value;
    const sessionUuid = verifySessionCookie(rawSession);
    if (!sessionUuid) throw new Error("Not authenticated");

    const query: any = { uuid: { $ne: sessionUuid }, isDiscoverable: true };

    const escapeRegex = (string: any) => {
        if (typeof string !== 'string') return '';
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    };

    if (filters.searchQuery && typeof filters.searchQuery === 'string') {
        const safeQuery = escapeRegex(filters.searchQuery);
        query.$or = [
            { fullName: { $regex: safeQuery, $options: "i" } },
            { username: { $regex: safeQuery, $options: "i" } },
            { bio: { $regex: safeQuery, $options: "i" } },
            { city: { $regex: safeQuery, $options: "i" }, shareLocation: true }
        ];
    }
    if (typeof filters.classLevel === 'string' && filters.classLevel !== "All") {
        query.classLevel = filters.classLevel.trim();
    }
    if (typeof filters.city === 'string' && filters.city !== "All") {
        const safeCity = escapeRegex(filters.city.trim());
        query.shareLocation = true;
        query.city = { $regex: safeCity, $options: "i" };
    }

    const users = await User.find(query).select('username fullName classLevel examFocus city shareLocation shareSocialLinks snapchat instagram bio shareProgress').limit(50).lean();
    
    // Ensure we convert _id to string or remove it so it's plain JSON serializable
    return users.map((u: any) => ({
        username: u.username,
        fullName: u.fullName,
        classLevel: u.classLevel,
        examFocus: u.examFocus,
        city: u.shareLocation ? u.city : undefined,
        snapchat: u.shareSocialLinks ? u.snapchat : undefined,
        instagram: u.shareSocialLinks ? u.instagram : undefined,
        shareProgress: u.shareProgress === true,
        bio: u.bio,
    }));
}
