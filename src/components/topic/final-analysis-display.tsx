"use client";
import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import type { FinalAnalysisOutput } from "@/ai/flows/analyze-answers";
import { CheckCircle, Info, Star, Target } from "lucide-react";
import { Bar, BarChart as BarChartComponent, CartesianGrid, XAxis, Pie, PieChart as PieChartComponent, Cell } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

interface FinalAnalysisDisplayProps {
  analysis: FinalAnalysisOutput;
  topicName: string;
}

export function FinalAnalysisDisplay({ analysis, topicName }: FinalAnalysisDisplayProps) {
  let charts = [];
  if (analysis.chartsData) {
      try {
          charts = JSON.parse(analysis.chartsData);
      } catch(e) {
          console.error("Failed to parse charts data", e);
      }
  }

  return (
    <div className="space-y-6">
    <Card className="bg-secondary/30">
      <CardHeader>
        <CardTitle className="font-headline text-3xl text-primary">Your Performance Analysis</CardTitle>
        <CardDescription className="text-base">{analysis.performanceSummary}</CardDescription>
      </CardHeader>
      <CardContent>
        <Accordion type="multiple" defaultValue={['focus', 'improve', 'bonus', 'tips']} className="w-full space-y-4">
          
          <AccordionItem value="focus" className="border rounded-lg bg-background px-4">
            <AccordionTrigger className="text-lg font-semibold hover:no-underline">
                <div className="flex items-center gap-3">
                    <Target className="text-primary" />
                    Areas to Focus
                </div>
            </AccordionTrigger>
            <AccordionContent className="pt-2 text-base">
              <ul className="list-disc pl-5 space-y-2">
                {analysis.areasToFocus.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="improve" className="border rounded-lg bg-background px-4">
            <AccordionTrigger className="text-lg font-semibold hover:no-underline">
                <div className="flex items-center gap-3">
                    <CheckCircle className="text-green-500" />
                    Where to Improve
                </div>
            </AccordionTrigger>
            <AccordionContent className="pt-2 text-base">
                <ul className="list-disc pl-5 space-y-2">
                    {analysis.areasToImprove.map((item, index) => (
                    <li key={index}>{item}</li>
                    ))}
                </ul>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="bonus" className="border rounded-lg bg-background px-4">
            <AccordionTrigger className="text-lg font-semibold hover:no-underline">
                <div className="flex items-center gap-3">
                    <Star className="text-yellow-500" />
                    Key Terms for Bonus Points
                </div>
            </AccordionTrigger>
            <AccordionContent className="pt-2 text-base">
              <ul className="list-disc pl-5 space-y-2">
                {analysis.keyTermsForBonus.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </AccordionContent>
          </AccordionItem>
          
          <AccordionItem value="tips" className="border rounded-lg bg-background px-4">
            <AccordionTrigger className="text-lg font-semibold hover:no-underline">
                <div className="flex items-center gap-3">
                    <Info className="text-blue-500" />
                    Extra Tips
                </div>
            </AccordionTrigger>
            <AccordionContent className="pt-2 text-base">
                <ul className="list-disc pl-5 space-y-2">
                    {analysis.extraTips.map((item, index) => (
                    <li key={index}>{item}</li>
                    ))}
                </ul>
            </AccordionContent>
          </AccordionItem>

        </Accordion>
      </CardContent>
    </Card>

    {charts.map((chart: any, index: number) => (
      <Card key={index} className="bg-secondary/30">
        <CardHeader>
          <CardTitle>{chart.title}</CardTitle>
        </CardHeader>
        <CardContent>
          {chart.type === 'bar' && chart.config && chart.data?.length > 0 && (
            <ChartContainer config={chart.config} className="min-h-[200px] w-full">
              <BarChartComponent accessibilityLayer data={chart.data}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border) / 0.5)"/>
                <XAxis dataKey="name" tickLine={false} tickMargin={10} axisLine={false} />
                <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" />} />
                <Bar dataKey="score" fill="hsl(var(--primary))" radius={4} />
              </BarChartComponent>
            </ChartContainer>
          )}
          {chart.type === 'pie' && chart.data?.length > 0 && (
            <ChartContainer config={chart.config || {}} className="mx-auto aspect-square h-[250px]">
              <PieChartComponent>
                <ChartTooltip content={<ChartTooltipContent nameKey="name" />} />
                <Pie data={chart.data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                   {chart.data.map((entry: any, idx: number) => (
                    <Cell key={`cell-${idx}`} fill={entry.fill || `hsl(var(--chart-${(idx % 5) + 1}))`} />
                  ))}
                </Pie>
              </PieChartComponent>
            </ChartContainer>
          )}
          {chart.type === 'histo' && chart.config && chart.data?.length > 0 && (
            <ChartContainer config={chart.config} className="min-h-[200px] w-full">
              <BarChartComponent accessibilityLayer data={chart.data} barCategoryGap={0}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border) / 0.5)"/>
                <XAxis dataKey="name" tickLine={false} tickMargin={10} axisLine={false} />
                <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" />} />
                <Bar dataKey="score" fill="hsl(var(--primary))" radius={0} />
              </BarChartComponent>
            </ChartContainer>
          )}
        </CardContent>
      </Card>
    ))}



    </div>
  );
}
