"use server";
import { cookies } from "next/headers";
import dbConnect from "@/lib/mongoose";
import User from "@/models/User";
import { getVerifiedSessionUuid } from "@/lib/session-auth";
import { checkDistributedRateLimit } from "@/lib/distributed-rate-limiter";
import { assertActiveNonBlacklistedUser } from "@/lib/ai-flow-auth";

export type SearchFilters = {
    searchQuery?: string;
    classLevel?: string;
    gender?: string;
    city?: string;
};

export async function searchAspirantsAction(filters: SearchFilters) {
    await dbConnect();
    const rawSession = (await cookies()).get("user_session")?.value;
    const sessionUuid = await getVerifiedSessionUuid(rawSession);
    if (!sessionUuid) throw new Error("Not authenticated");

    const rateLimit = await checkDistributedRateLimit("aspirant-search:" + sessionUuid, 30, 60_000);
    if (!rateLimit.success) throw new Error("Search limit reached. Please wait a minute before searching again.");

    await assertActiveNonBlacklistedUser(sessionUuid);

    const safeFilters: SearchFilters = filters && typeof filters === "object" ? filters : {};
    const query: Record<string, any> = { uuid: { $ne: sessionUuid } }; // don't return the logged-in user

    const escapeRegex = (string: any) => {
        if (typeof string !== 'string') return '';
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    };

    if (typeof safeFilters.searchQuery === 'string' && safeFilters.searchQuery.trim().length > 0) {
        const safeQuery = escapeRegex(safeFilters.searchQuery.trim().slice(0, 80));
        query.$or = [
            { fullName: { $regex: safeQuery, $options: "i" } },
            { username: { $regex: safeQuery, $options: "i" } },
            { city: { $regex: safeQuery, $options: "i" } },
            { bio: { $regex: safeQuery, $options: "i" } }
        ];
    }
    if (typeof safeFilters.classLevel === 'string') {
        const cleanClass = safeFilters.classLevel.trim().slice(0, 60);
        if (cleanClass && cleanClass !== "All") {
            query.classLevel = cleanClass;
        }
    }
    if (typeof safeFilters.gender === 'string') {
        const cleanGender = safeFilters.gender.trim().slice(0, 40);
        if (cleanGender && cleanGender !== "All") {
            query.gender = cleanGender;
        }
    }
    if (typeof safeFilters.city === 'string') {
        const trimmedCity = safeFilters.city.trim().slice(0, 80);
        if (trimmedCity && trimmedCity !== "All") {
            const safeCity = escapeRegex(trimmedCity);
            query.city = { $regex: safeCity, $options: "i" };
        }
    }

    const users = await User.find(query)
        .select('username fullName gender classLevel examFocus city futureCollege snapchat instagram bio createdAt')
        .sort({ createdAt: -1 })
        .limit(50)
        .lean();

    // Ensure we convert _id to string or remove it so it's plain JSON serializable
    return users.map((u: any) => ({
        username: u.username,
        fullName: u.fullName,
        gender: u.gender,
        classLevel: u.classLevel,
        examFocus: u.examFocus,
        city: u.city,
        futureCollege: u.futureCollege,
        snapchat: u.snapchat,
        instagram: u.instagram,
        bio: u.bio,
        createdAt: u.createdAt
    }));
}
