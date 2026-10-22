using UnrealBuildTool;

public class SlimeReborn : ModuleRules
{
	public SlimeReborn(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
		PublicDependencyModuleNames.AddRange(new string[] {
			"Core", "CoreUObject", "Engine", "InputCore", "ProceduralMeshComponent"
		});
	}
}
