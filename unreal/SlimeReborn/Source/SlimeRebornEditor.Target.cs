using UnrealBuildTool;
using System.Collections.Generic;

public class SlimeRebornEditorTarget : TargetRules
{
	public SlimeRebornEditorTarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Editor;
		DefaultBuildSettings = BuildSettingsVersion.Latest;
		IncludeOrderVersion = EngineIncludeOrderVersion.Latest;
		ExtraModuleNames.Add("SlimeReborn");
	}
}
