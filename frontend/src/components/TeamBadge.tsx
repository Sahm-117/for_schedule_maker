import React from 'react';

interface Team {
  id: number;
  name: string;
  color: string;
}

interface TeamBadgeProps {
  teams: Team[];
  inline?: boolean; // If true, displays inline with text. If false, displays as badges
}

const TeamBadge: React.FC<TeamBadgeProps> = ({ teams, inline = false }) => {
  if (!teams || teams.length === 0) return null;

  if (inline) {
    // Inline display: (Team1, Team2) with colored text
    return (
      <span className="inline-flex items-center gap-1">
        <span className="text-gray-500">(</span>
        {teams.map((team, index) => (
          <React.Fragment key={team.id}>
            <span
              className="font-medium"
              style={{ color: team.color }}
            >
              {team.name}
            </span>
            {index < teams.length - 1 && <span className="text-gray-500">, </span>}
          </React.Fragment>
        ))}
        <span className="text-gray-500">)</span>
      </span>
    );
  }

  // Badge display: Colored pills
  return (
    <div className="inline-flex flex-wrap gap-1">
      {teams.map((team) => (
        <span
          key={team.id}
          className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium text-white"
          style={{ backgroundColor: team.color }}
        >
          {team.name}
        </span>
      ))}
    </div>
  );
};

export default TeamBadge;
