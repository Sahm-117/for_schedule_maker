import React, { useState, useEffect } from 'react';
import { teamsApi } from '../services/supabase-api';

interface Team {
  id: number;
  name: string;
  color: string;
}

interface TeamSelectorProps {
  selectedTeamIds: number[];
  onChange: (teamIds: number[]) => void;
  label?: string;
}

const TeamSelector: React.FC<TeamSelectorProps> = ({
  selectedTeamIds,
  onChange,
  label = 'Teams (optional)'
}) => {
  const [teams, setTeams] = useState<Team[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadTeams();
  }, []);

  const loadTeams = async () => {
    try {
      setIsLoading(true);
      const { teams: fetchedTeams } = await teamsApi.getAll();
      setTeams(fetchedTeams);
    } catch (error) {
      console.error('Failed to load teams:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggle = (teamId: number) => {
    if (selectedTeamIds.includes(teamId)) {
      onChange(selectedTeamIds.filter(id => id !== teamId));
    } else {
      onChange([...selectedTeamIds, teamId]);
    }
  };

  const handleRemove = (teamId: number) => {
    onChange(selectedTeamIds.filter(id => id !== teamId));
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">{label}</label>
        <div className="text-sm text-gray-500">Loading teams...</div>
      </div>
    );
  }

  if (teams.length === 0) {
    return null; // Don't show if no teams exist
  }

  const selectedTeams = teams.filter(t => selectedTeamIds.includes(t.id));

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">{label}</label>

      {/* Always use checkboxes for mobile-friendly multi-select */}
      <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-md p-2 space-y-1">
        {teams.map((team) => (
          <label
            key={team.id}
            className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-2 rounded-md transition-colors"
          >
            <input
              type="checkbox"
              checked={selectedTeamIds.includes(team.id)}
              onChange={() => handleToggle(team.id)}
              className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
            />
            <div
              className="w-4 h-4 rounded flex-shrink-0"
              style={{ backgroundColor: team.color }}
            />
            <span className="text-sm text-gray-700">{team.name}</span>
          </label>
        ))}
      </div>

      {/* Selected Teams as Colored Badges */}
      {selectedTeams.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {selectedTeams.map((team) => (
            <div
              key={team.id}
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-white text-sm font-medium"
              style={{ backgroundColor: team.color }}
            >
              <span>{team.name}</span>
              <button
                type="button"
                onClick={() => handleRemove(team.id)}
                className="hover:bg-white/20 rounded-full p-0.5 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TeamSelector;
