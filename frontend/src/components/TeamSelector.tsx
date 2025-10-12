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
  const useCheckboxes = teams.length <= 4;

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">{label}</label>

      {/* Checkboxes for ≤4 teams */}
      {useCheckboxes && (
        <div className="space-y-2">
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
      )}

      {/* Dropdown for >4 teams */}
      {!useCheckboxes && (
        <div className="relative">
          <select
            multiple
            value={selectedTeamIds.map(String)}
            onChange={(e) => {
              const selected = Array.from(e.target.selectedOptions).map(opt => parseInt(opt.value));
              onChange(selected);
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            size={Math.min(teams.length, 6)}
          >
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-1">
            Hold Cmd/Ctrl to select multiple teams
          </p>
        </div>
      )}

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
