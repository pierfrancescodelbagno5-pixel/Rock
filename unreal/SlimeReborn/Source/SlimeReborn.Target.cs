using UnrealBuildTool;
using System.Collections.Generic;

public class SlimeRebornTarget : TargetRules
{
	public SlimeRebornTarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Game;
		DefaultBuildSettings = BuildSettingsVersion.Latest;
		IncludeOrderVersion = EngineIncludeOrderVersion.Latest;
		ExtraModuleNames.Add("SlimeReborn");
	}
}
