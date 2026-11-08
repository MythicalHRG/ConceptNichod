"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { searchAspirantsAction, SearchFilters } from "@/app/actions/aspirants";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Loader2, Search, MapPin, GraduationCap, Target, Instagram, X } from "lucide-react";
import { useAuth } from "@/components/auth/auth-context";

export default function AspirantsConnectPage() {
    const { isLoggedIn, isAuthReady, setAuthModalOpen } = useAuth();
    const [users, setUsers] = useState<any[]>([]);
    const [isInitialLoading, setIsInitialLoading] = useState(true);
    const [isLiveSearching, setIsLiveSearching] = useState(false);

    const [filters, setFilters] = useState<SearchFilters>({
        searchQuery: "",
        classLevel: "All",
        gender: "All",
        city: "",
    });

    const latestQueryId = useRef(0);
    const hasInitializedRef = useRef(false);

    const performSearch = useCallback(async (currentFilters: SearchFilters, isInitial = false) => {
        if (isInitial) {
            setIsInitialLoading(true);
        } else {
            setIsLiveSearching(true);
        }
        const queryId = ++latestQueryId.current;

        try {
            const results = await searchAspirantsAction(currentFilters);
            if (queryId === latestQueryId.current) {
                setUsers(results);
            }
        } catch (error) {
            console.error("Failed to fetch users", error);
        } finally {
            if (queryId === latestQueryId.current) {
                setIsLiveSearching(false);
                setIsInitialLoading(false);
            }
        }
    }, []);

    // Live search on any filter change with smooth debouncing
    useEffect(() => {
        if (!isAuthReady || !isLoggedIn) return;

        if (!hasInitializedRef.current) {
            hasInitializedRef.current = true;
            performSearch(filters, true);
            return;
        }

        setIsLiveSearching(true);
        const debounceTimer = setTimeout(() => {
            performSearch(filters, false);
        }, 250);

        return () => clearTimeout(debounceTimer);
    }, [filters, isAuthReady, isLoggedIn, performSearch]);

    const clearSearchQuery = () => {
        setFilters((prev) => ({ ...prev, searchQuery: "" }));
    };

    const resetAllFilters = () => {
        setFilters({
            searchQuery: "",
            classLevel: "All",
            gender: "All",
            city: "",
        });
    };

    const hasActiveFilters = Boolean(
        filters.searchQuery?.trim() ||
        (filters.classLevel && filters.classLevel !== "All") ||
        (filters.gender && filters.gender !== "All") ||
        filters.city?.trim()
    );

    if (!isAuthReady) {
        return (
            <div className="flex min-h-[50vh] items-center justify-center gap-2 text-muted-foreground" role="status">
                <Loader2 className="size-5 animate-spin" />
                <span>Restoring your session…</span>
            </div>
        );
    }

    if (!isLoggedIn) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4">
                <h1 className="text-2xl font-bold">AspirantsConnect</h1>
                <p className="text-muted-foreground">You must be signed in to connect with other students.</p>
                <Button onClick={() => setAuthModalOpen(true)}>Sign In</Button>
            </div>
        );
    }

    return (
        <div className="flex flex-col space-y-6 max-w-5xl mx-auto w-full pb-10">
            <div>
                <h1 className="mb-2 break-words font-headline text-3xl text-primary sm:text-4xl">AspirantsConnect</h1>
                <p className="text-muted-foreground text-lg">
                    Find and connect with your future study mates. Search live by name, city, class, or goal.
                </p>
            </div>

            <Card className="bg-secondary/30">
                <CardContent className="pt-6">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="md:col-span-4 flex gap-2">
                            <div className="relative flex-1">
                                <Search className={`absolute left-3 top-3 h-4 w-4 transition-colors ${isLiveSearching ? "text-primary" : "text-muted-foreground"}`} />
                                <Input
                                    placeholder="Search by name, username, or bio..."
                                    className="pl-9 pr-9 h-10 transition-all focus-visible:ring-primary"
                                    value={filters.searchQuery}
                                    onChange={(e) => setFilters((prev) => ({ ...prev, searchQuery: e.target.value }))}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                            e.preventDefault();
                                            performSearch(filters, false);
                                        }
                                    }}
                                />
                                {isLiveSearching ? (
                                    <div className="absolute right-3 top-3 flex items-center pointer-events-none" title="Live searching...">
                                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                                    </div>
                                ) : filters.searchQuery ? (
                                    <button
                                        type="button"
                                        onClick={clearSearchQuery}
                                        className="absolute right-3 top-2.5 flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                                        title="Clear search"
                                        aria-label="Clear search"
                                    >
                                        <X className="h-3.5 w-3.5" />
                                    </button>
                                ) : null}
                            </div>
                            <Button
                                type="button"
                                variant="default"
                                className="h-10 shrink-0 gap-2 px-4"
                                onClick={() => performSearch(filters, false)}
                                disabled={isLiveSearching}
                            >
                                {isLiveSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                                <span>Search</span>
                            </Button>
                        </div>
                        
                        <div>
                            <label className="text-xs font-medium mb-1 block">Class Level</label>
                            <select 
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                                value={filters.classLevel}
                                onChange={(e) => setFilters((prev) => ({ ...prev, classLevel: e.target.value }))}
                            >
                                <option value="All">All Classes</option>
                                {["Class 9", "Class 10", "Class 11", "Class 12", "12+", "Dropper"].map((c) => (
                                    <option key={c} value={c}>{c}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="text-xs font-medium mb-1 block">Gender</label>
                            <select 
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                                value={filters.gender}
                                onChange={(e) => setFilters((prev) => ({ ...prev, gender: e.target.value }))}
                            >
                                <option value="All">All Genders</option>
                                <option value="Male">Male</option>
                                <option value="Female">Female</option>
                                <option value="Other">Other</option>
                            </select>
                        </div>

                        <div className="md:col-span-2">
                            <label className="text-xs font-medium mb-1 block">City</label>
                            <Input
                                placeholder="Filter by City"
                                value={filters.city}
                                onChange={(e) => setFilters((prev) => ({ ...prev, city: e.target.value }))}
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Results status bar */}
            <div className="flex items-center justify-between text-sm px-1">
                <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">
                        {isInitialLoading
                            ? "Loading aspirants..."
                            : `${users.length} aspirant${users.length === 1 ? "" : "s"} found`}
                    </span>
                    {isLiveSearching && !isInitialLoading && (
                        <span className="inline-flex items-center gap-1.5 text-xs text-primary font-medium animate-pulse">
                            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                            Live updating
                        </span>
                    )}
                </div>
                {hasActiveFilters && (
                    <button
                        type="button"
                        onClick={resetAllFilters}
                        className="text-xs text-muted-foreground hover:text-primary transition-colors hover:underline"
                    >
                        Reset filters
                    </button>
                )}
            </div>

            <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 transition-opacity duration-200 ${isLiveSearching && !isInitialLoading ? "opacity-70" : "opacity-100"}`}>
                {isInitialLoading ? (
                    <div className="col-span-full flex flex-col items-center justify-center py-16 space-y-3">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        <p className="text-sm text-muted-foreground animate-pulse">Finding aspirants...</p>
                    </div>
                ) : users.length === 0 ? (
                    <div className="col-span-full text-center py-12 text-muted-foreground border border-dashed rounded-lg space-y-2">
                        <p className="font-medium text-foreground">No students found matching your criteria.</p>
                        <p className="text-xs">Try searching with different keywords, class level, or city.</p>
                        {hasActiveFilters && (
                            <Button variant="outline" size="sm" onClick={resetAllFilters} className="mt-3">
                                Clear all filters
                            </Button>
                        )}
                    </div>
                ) : (
                    users.map((user) => (
                        <Card key={user.username} className="flex flex-col hover:shadow-md transition-shadow">
                            <CardHeader className="pb-4">
                                <CardTitle className="text-lg">{user.fullName}</CardTitle>
                                <CardDescription>@{user.username}</CardDescription>
                            </CardHeader>
                            <CardContent className="flex-1 space-y-4">
                                {user.bio && (
                                    <p className="text-sm italic text-muted-foreground line-clamp-3">"{user.bio}"</p>
                                )}
                                <div className="space-y-2 text-sm">
                                    <div className="flex items-center gap-2">
                                        <GraduationCap className="h-4 w-4 text-primary" />
                                        <span>{user.classLevel}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <MapPin className="h-4 w-4 text-primary" />
                                        <span>{user.city}</span>
                                    </div>
                                    {(user.examFocus || user.futureCollege) && (
                                        <div className="flex items-start gap-2">
                                            <Target className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                                            <span>
                                                {user.examFocus && <span className="font-medium mr-1">{user.examFocus}</span>}
                                                {user.examFocus && user.futureCollege && " • "}
                                                {user.futureCollege && <span>{user.futureCollege}</span>}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </CardContent>
                            <CardFooter className="pt-4 border-t flex flex-col gap-2">
                                <a href={`/profile/${user.username}`} target="_blank" rel="noopener noreferrer" className="w-full">
                                    <Button variant="default" className="w-full">
                                        View Public Profile
                                    </Button>
                                </a>
                                <div className="flex w-full gap-2">
                                    {user.snapchat ? (
                                        <a href={`https://snapchat.com/add/${user.snapchat.replace('@', '')}`} target="_blank" rel="noopener noreferrer" className="flex-1">
                                            <Button variant="outline" className="w-full text-yellow-600 border-yellow-600 hover:bg-yellow-50 hover:text-yellow-700">
                                                Snapchat
                                            </Button>
                                        </a>
                                    ) : null}
                                    {user.instagram ? (
                                        <a href={`https://instagram.com/${user.instagram.replace('@', '')}`} target="_blank" rel="noopener noreferrer" className="flex-1">
                                            <Button variant="outline" className="w-full text-pink-600 border-pink-600 hover:bg-pink-50 hover:text-pink-700">
                                                <Instagram className="h-4 w-4 mr-2" /> Insta
                                            </Button>
                                        </a>
                                    ) : null}
                                </div>
                                {!user.snapchat && !user.instagram && (
                                    <p className="text-xs text-muted-foreground text-center w-full mt-1">No socials provided</p>
                                )}
                            </CardFooter>
                        </Card>
                    ))
                )}
            </div>
        </div>
    );
}
