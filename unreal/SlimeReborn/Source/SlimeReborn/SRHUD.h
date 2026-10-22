#pragma once

#include "CoreMinimal.h"
#include "GameFramework/HUD.h"
#include "SRHUD.generated.h"

class ASlimeCharacter;
class ASRGameMode;
class UFont;

/** Canvas-drawn HUD: bars, skill bar, compass, quest tracker, Sage messages, damage numbers, menus. */
UCLASS()
class SLIMEREBORN_API ASRHUD : public AHUD
{
	GENERATED_BODY()

public:
	virtual void DrawHUD() override;

	void PushOracle(const FString& Text);
	void ShowToast(const FString& Big, const FString& Small);
	void DamageNumber(const FVector& At, float Amount, const FLinearColor& Color, const FString& Prefix);

private:
	struct FOracleLine { FString Text; float Age = 0.f; };
	struct FDmgNumber { FVector At; FString Text; FLinearColor Color; float Age = 0.f; float DriftX = 0.f; float Size = 30.f; };

	void DrawMenu(ASRGameMode* GM);
	void DrawStatus(ASlimeCharacter* P);
	void DrawSkillBar(ASlimeCharacter* P);
	void DrawCompass(ASlimeCharacter* P, ASRGameMode* GM);
	void DrawQuest(ASlimeCharacter* P, ASRGameMode* GM);
	void DrawOracle(float Dt);
	void DrawToast(float Dt);
	void DrawWorldMarkers(ASlimeCharacter* P);
	void DrawDamage(float Dt);
	void DrawPrompt(ASlimeCharacter* P);
	void DrawDialog(ASlimeCharacter* P);
	void DrawGraceMenu(ASlimeCharacter* P);
	void DrawHelp();
	void DrawDeath(ASlimeCharacter* P);
	void DrawBoss(ASRGameMode* GM);
	void DrawKeyHints();

	void Panel(float X, float Y, float W, float H, const FLinearColor& C = FLinearColor(0.f, 0.f, 0.f, 0.55f));
	void Frame(float X, float Y, float W, float H, const FLinearColor& C, float T = 1.5f);
	void Bar(float X, float Y, float W, float H, float Pct, const FLinearColor& Fill, const FLinearColor& Back = FLinearColor(0.f, 0.f, 0.f, 0.6f));
	void Txt(const FString& S, float X, float Y, const FLinearColor& C, float SizePx, bool bCenter = false, bool bShadow = true);
	float TxtW(const FString& S, float SizePx);
	TArray<FString> Wrap(const FString& S, float MaxW, float SizePx);
	bool ToScreen(const FVector& World, FVector2D& Out) const;
	UFont* Font() const;

	TArray<FOracleLine> Oracle;
	TArray<FDmgNumber> Numbers;
	FString ToastBig;
	FString ToastSmall;
	float ToastAge = 100.f;
	float LastTime = -1.f;
	float UI = 1.f;
	float FontBase = 0.f;
	float Time = 0.f;
};
