"use client";

import { useState, useEffect } from "react";
import { searchAspirantsAction, SearchFilters } from "@/app/actions/aspirants";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Loader2, Search, MapPin, GraduationCap, Target, Instagram, Twitter } from "lucide-react";
import { useAuth } from "@/components/auth/auth-context";

export default function AspirantsConnectPage() {
    const { isLoggedIn, isAuthReady, setAuthModalOpen } = useAuth();
    const [users, setUsers] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    const [filters, setFilters] = useState<SearchFilters>({
        searchQuery: "",
        classLevel: "All",
        gender: "All",
        city: "",
    });

    useEffect(() => {
        if (isAuthReady && isLoggedIn) {
            handleSearch();
        }
    }, [isAuthReady, isLoggedIn]);

    const handleSearch = async () => {
        setIsLoading(true);
        try {
            const results = await searchAspirantsAction(filters);
            setUsers(results);
        } catch (error) {
            console.error("Failed to fetch users", error);
        } finally {
            setIsLoading(false);
        }
    };

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
                    Find and connect with your future study mates. Search by city, class, or goal.
                </p>
            </div>

            <Card className="bg-secondary/30">
                <CardContent className="pt-6">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="md:col-span-4 flex gap-2">
                            <div className="relative flex-1">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search by name, username, or bio..."
                                    className="pl-8"
                                    value={filters.searchQuery}
                                    onChange={(e) => setFilters({ ...filters, searchQuery: e.target.value })}
                                />
                            </div>
                            <Button onClick={handleSearch} disabled={isLoading}>
                                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Search"}
                            </Button>
                        </div>
                        
                        <div>
                            <label className="text-xs font-medium mb-1 block">Class Level</label>
                            <select 
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                                value={filters.classLevel}
                                onChange={(e) => setFilters({ ...filters, classLevel: e.target.value })}
                            >
                                <option value="All">All Classes</option>
                                {["Class 9", "Class 10", "Class 11", "Class 12", "12+", "Dropper"].map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>

                        <div>
                            <label className="text-xs font-medium mb-1 block">Gender</label>
                            <select 
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                                value={filters.gender}
                                onChange={(e) => setFilters({ ...filters, gender: e.target.value })}
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
                                onChange={(e) => setFilters({ ...filters, city: e.target.value })}
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {isLoading ? (
                    <div className="col-span-full flex justify-center py-10">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                ) : users.length === 0 ? (
                    <div className="col-span-full text-center py-10 text-muted-foreground border border-dashed rounded-lg">
                        No students found matching your criteria.
                    </div>
                ) : (
                    users.map((user) => (
                        <Card key={user.uuid} className="flex flex-col hover:shadow-md transition-shadow">
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
