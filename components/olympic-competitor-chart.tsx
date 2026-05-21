"use client";

import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell } from "recharts";

type Props = {
  olympic: number;
  competitor: number;
};

export function OlympicCompetitorChart({ olympic, competitor }: Props) {
  const data = [
    { name: "Olympic", count: olympic, fill: "#E8A317" },
    { name: "Competitor", count: competitor, fill: "#E07A5F" },
  ];

  return (
    <div className="h-32 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 8 }}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="name" width={80} tick={{ fill: "currentColor", fontSize: 12 }} />
          <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={24}>
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="mt-2 flex justify-between text-xs text-muted-foreground">
        <span>Olympic: {olympic}</span>
        <span>Competitor: {competitor}</span>
      </div>
    </div>
  );
}
