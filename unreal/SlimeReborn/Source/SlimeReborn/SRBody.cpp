#include "SRBody.h"
#include "Components/SceneComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Materials/MaterialInstanceDynamic.h"

void FSRRig::Track(UStaticMeshComponent* Part, const FLinearColor& Color)
{
	if (!Part) return;
	if (UMaterialInstanceDynamic* M = Cast<UMaterialInstanceDynamic>(Part->GetMaterial(0)))
	{
		Mids.Add(M);
		BaseColors.Add(Color);
	}
}

void FSRRig::Flash(float Amount, const FLinearColor& FlashColor)
{
	Amount = FMath::Clamp(Amount, 0.f, 1.f);
	for (int32 i = 0; i < Mids.Num(); ++i)
	{
		if (Mids[i]) Mids[i]->SetVectorParameterValue(TEXT("Color"), FMath::Lerp(BaseColors[i], FlashColor, Amount));
	}
}

void FSRRig::SetVisible(bool bVisible)
{
	if (Root) Root->SetVisibility(bVisible, true);
}

void FSRRig::Walk(float Phase, float Amount, float Time)
{
	const float S = FMath::Sin(Phase);
	if (bSpider)
	{
		for (int32 i = 0; i < Legs.Num(); ++i)
		{
			if (!Legs[i] || !LegRest.IsValidIndex(i)) continue;
			const float P = Phase + (i % 2 ? PI : 0.f) + (i / 2) * 0.6f;
			FRotator Rot = LegRest[i];
			Rot.Yaw += FMath::Sin(P) * 14.f * Amount;
			Rot.Roll += FMath::Max(0.f, FMath::Cos(P)) * 12.f * Amount;
			Legs[i]->SetRelativeRotation(Rot);
		}
		if (Torso) Torso->SetRelativeLocation(FVector(0, 0, 55.f + FMath::Sin(Time * 2.f) * 2.f + FMath::Abs(S) * 4.f * Amount));
		return;
	}
	if (bQuadruped)
	{
		const float Swing = 38.f * Amount;
		if (Legs.Num() == 4)
		{
			Legs[0]->SetRelativeRotation(FRotator(S * Swing, 0, 0));
			Legs[3]->SetRelativeRotation(FRotator(S * Swing, 0, 0));
			Legs[1]->SetRelativeRotation(FRotator(-S * Swing, 0, 0));
			Legs[2]->SetRelativeRotation(FRotator(-S * Swing, 0, 0));
		}
		if (Torso) Torso->SetRelativeLocation(FVector(0, 0, 60.f + FMath::Abs(FMath::Cos(Phase)) * 6.f * Amount + FMath::Sin(Time * 2.5f) * 1.2f));
		if (Tail) Tail->SetRelativeRotation(FRotator(0, FMath::Sin(Time * (3.f + 8.f * Amount)) * 20.f, 0));
		if (Head) Head->SetRelativeRotation(FRotator(-S * 4.f * Amount, 0, 0));
		return;
	}
	const float Swing = 34.f * Amount;
	if (LegL) LegL->SetRelativeRotation(FRotator(S * Swing, 0, 0));
	if (LegR) LegR->SetRelativeRotation(FRotator(-S * Swing, 0, 0));
	if (ArmL) ArmL->SetRelativeRotation(FRotator(-S * Swing * 0.8f, 0, -4.f));
	if (ArmR) ArmR->SetRelativeRotation(FRotator(S * Swing * 0.8f, 0, 4.f));
	if (Torso)
	{
		const float Breath = FMath::Sin(Time * 1.8f) * 1.2f * (1.f - Amount);
		Torso->SetRelativeLocation(FVector(0, 0, FMath::Abs(FMath::Cos(Phase)) * 3.f * Amount + Breath));
		Torso->SetRelativeRotation(FRotator(-4.f * Amount, S * 4.f * Amount, 0));
	}
}

static UStaticMeshComponent* Part(AActor* O, FSRRig& Rig, USceneComponent* Parent, const TCHAR* Shape, const FVector& L, const FVector& S,
	const FLinearColor& C, const FRotator& R = FRotator::ZeroRotator, bool bTrack = true, ESRMat Mat = ESRMat::Lit, float Glow = 0.f)
{
	UStaticMeshComponent* P = SR::AddPart(O, Parent, Shape, L, S, C, R, Mat, Glow);
	if (bTrack) Rig.Track(P, C);
	return P;
}

FSRRig SR::BuildHumanoid(AActor* O, USceneComponent* Parent, const FSRHumanStyle& S)
{
	FSRRig Rig;
	const float H = S.Height, B = S.Bulk;
	Rig.Root = AddPivot(O, Parent, FVector::ZeroVector);
	Rig.Root->SetRelativeScale3D(FVector(H));

	// Legs pivot at the hips (Z = 95)
	Rig.LegL = AddPivot(O, Rig.Root, FVector(0, -12.f * B, 95.f));
	Rig.LegR = AddPivot(O, Rig.Root, FVector(0, 12.f * B, 95.f));
	for (USceneComponent* Leg : { Rig.LegL.Get(), Rig.LegR.Get() })
	{
		Part(O, Rig, Leg, TEXT("Cylinder"), FVector(0, 0, -44.f), FVector(0.17f * B, 0.17f * B, 0.86f), S.Pants);
		Part(O, Rig, Leg, TEXT("Cube"), FVector(4.f, 0, -86.f), FVector(0.24f, 0.15f * B, 0.14f), S.Boots);
	}

	// Torso
	Rig.Torso = AddPivot(O, Rig.Root, FVector(0, 0, 0));
	USceneComponent* T = Rig.Torso;
	Part(O, Rig, T, TEXT("Cube"), FVector(0, 0, 128.f), FVector(0.26f * B, 0.42f * B, 0.62f), S.Shirt);
	Part(O, Rig, T, TEXT("Cube"), FVector(0, 0, 98.f), FVector(0.28f * B, 0.44f * B, 0.08f), S.Boots);
	Part(O, Rig, T, TEXT("Cube"), FVector(13.f * B, 0, 98.f), FVector(0.04f, 0.08f, 0.06f), S.Accent, FRotator::ZeroRotator, false);
	if (S.bSkirt) Part(O, Rig, T, TEXT("Cone"), FVector(0, 0, 72.f), FVector(0.6f * B, 0.6f * B, 0.6f), S.Shirt);
	if (S.bCape) Part(O, Rig, T, TEXT("Cube"), FVector(-16.f * B, 0, 110.f), FVector(0.04f, 0.46f * B, 0.95f), S.Cape, FRotator(-6.f, 0, 0));
	if (S.bTail)
	{
		Rig.Tail = AddPivot(O, T, FVector(-14.f * B, 0, 92.f));
		Part(O, Rig, Rig.Tail, TEXT("Cone"), FVector(-30.f, 0, -20.f), FVector(0.22f * B, 0.22f * B, 0.8f), S.Skin, FRotator(-125.f, 0, 0));
	}
	// Shoulder pads for armoured folk
	if (S.bHelmet)
	{
		Part(O, Rig, T, TEXT("Sphere"), FVector(0, -24.f * B, 156.f), FVector(0.2f * B, 0.2f * B, 0.14f), S.Shirt);
		Part(O, Rig, T, TEXT("Sphere"), FVector(0, 24.f * B, 156.f), FVector(0.2f * B, 0.2f * B, 0.14f), S.Shirt);
	}

	// Head
	Rig.Head = AddPivot(O, T, FVector(0, 0, 160.f));
	USceneComponent* Hd = Rig.Head;
	Part(O, Rig, Hd, TEXT("Cylinder"), FVector(0, 0, 2.f), FVector(0.1f, 0.1f, 0.1f), S.Skin);
	Part(O, Rig, Hd, TEXT("Sphere"), FVector(0, 0, 16.f), FVector(0.25f, 0.23f, 0.27f), S.Skin);
	const FLinearColor EyeC = S.Eyes;
	const ESRMat EyeMat = S.bGlowEyes ? ESRMat::Fx : ESRMat::Lit;
	Part(O, Rig, Hd, TEXT("Sphere"), FVector(11.5f, -5.f, 18.f), FVector(0.045f), EyeC, FRotator::ZeroRotator, false, EyeMat, 12.f);
	Part(O, Rig, Hd, TEXT("Sphere"), FVector(11.5f, 5.f, 18.f), FVector(0.045f), EyeC, FRotator::ZeroRotator, false, EyeMat, 12.f);
	if (S.bSnout)
	{
		Part(O, Rig, Hd, TEXT("Cube"), FVector(16.f, 0, 10.f), FVector(0.24f, 0.16f, 0.12f), S.Skin);
		Part(O, Rig, Hd, TEXT("Cone"), FVector(-6.f, 0, 30.f), FVector(0.1f, 0.04f, 0.2f), S.Accent, FRotator(-20.f, 0, 0));
	}
	if (S.bHelmet)
	{
		Part(O, Rig, Hd, TEXT("Sphere"), FVector(-1.f, 0, 20.f), FVector(0.29f, 0.27f, 0.29f), S.Shirt);
		Part(O, Rig, Hd, TEXT("Cube"), FVector(13.f, 0, 17.f), FVector(0.02f, 0.18f, 0.03f), FLinearColor(0.02f, 0.02f, 0.02f), FRotator::ZeroRotator, false);
		Part(O, Rig, Hd, TEXT("Cube"), FVector(-2.f, 0, 36.f), FVector(0.22f, 0.03f, 0.1f), S.Cape);
	}
	else if (!S.bBald)
	{
		Part(O, Rig, Hd, TEXT("Sphere"), FVector(-3.f, 0, 22.f), FVector(0.27f, 0.25f, 0.22f), S.Hair);
		if (S.bLongHair) Part(O, Rig, Hd, TEXT("Cube"), FVector(-11.f, 0, 2.f), FVector(0.08f, 0.24f, 0.36f), S.Hair);
	}
	if (S.bBeard) Part(O, Rig, Hd, TEXT("Cube"), FVector(9.f, 0, 5.f), FVector(0.1f, 0.18f, 0.16f), S.Hair);
	if (S.bPointyEars)
	{
		Part(O, Rig, Hd, TEXT("Cone"), FVector(0, -13.f, 20.f), FVector(0.06f, 0.06f, 0.18f), S.Skin, FRotator(0, 0, -70.f));
		Part(O, Rig, Hd, TEXT("Cone"), FVector(0, 13.f, 20.f), FVector(0.06f, 0.06f, 0.18f), S.Skin, FRotator(0, 0, 70.f));
	}
	if (S.bTusks)
	{
		Part(O, Rig, Hd, TEXT("Cone"), FVector(11.f, -5.f, 8.f), FVector(0.03f, 0.03f, 0.08f), SR::Hex(0xf0ead8), FRotator::ZeroRotator, false);
		Part(O, Rig, Hd, TEXT("Cone"), FVector(11.f, 5.f, 8.f), FVector(0.03f, 0.03f, 0.08f), SR::Hex(0xf0ead8), FRotator::ZeroRotator, false);
	}
	if (S.bCrown)
	{
		Part(O, Rig, Hd, TEXT("Cylinder"), FVector(0, 0, 36.f), FVector(0.24f, 0.24f, 0.08f), SR::Hex(0xd4a72c), FRotator::ZeroRotator, false);
		for (int32 k = 0; k < 5; ++k)
		{
			const FVector P = FRotator(0, k * 72.f, 0).Vector() * 10.f;
			Part(O, Rig, Hd, TEXT("Cone"), FVector(P.X, P.Y, 43.f), FVector(0.05f, 0.05f, 0.1f), SR::Hex(0xd4a72c), FRotator::ZeroRotator, false);
		}
	}

	// Arms pivot at the shoulders
	Rig.ArmL = AddPivot(O, T, FVector(0, -27.f * B, 152.f));
	Rig.ArmR = AddPivot(O, T, FVector(0, 27.f * B, 152.f));
	for (USceneComponent* Arm : { Rig.ArmL.Get(), Rig.ArmR.Get() })
	{
		Part(O, Rig, Arm, TEXT("Cylinder"), FVector(0, 0, -30.f), FVector(0.12f * B, 0.12f * B, 0.62f), S.Shirt);
		Part(O, Rig, Arm, TEXT("Sphere"), FVector(0, 0, -64.f), FVector(0.11f * B), S.Skin);
	}
	Rig.Hand = AddPivot(O, Rig.ArmR, FVector(2.f, 0, -64.f));
	AddWeapon(O, Rig, S.Weapon, S.Accent);
	return Rig;
}

void SR::AddWeapon(AActor* O, FSRRig& Rig, int32 Weapon, const FLinearColor& Accent)
{
	if (!Rig.Hand || Weapon <= 0) return;
	USceneComponent* Hn = Rig.Hand;
	const FLinearColor Steel = SR::Hex(0xc8ccd4);
	const FLinearColor Wood = SR::Hex(0x5a3d26);
	switch (Weapon)
	{
	case 1: // sword
		Part(O, Rig, Hn, TEXT("Cube"), FVector(52.f, 0, 0), FVector(0.85f, 0.03f, 0.08f), Steel, FRotator::ZeroRotator, false);
		Part(O, Rig, Hn, TEXT("Cube"), FVector(8.f, 0, 0), FVector(0.04f, 0.26f, 0.05f), Accent, FRotator::ZeroRotator, false);
		Part(O, Rig, Hn, TEXT("Cylinder"), FVector(-4.f, 0, 0), FVector(0.05f, 0.05f, 0.2f), Wood, FRotator(90.f, 0, 0), false);
		break;
	case 2: // spear
		Part(O, Rig, Hn, TEXT("Cylinder"), FVector(40.f, 0, 0), FVector(0.05f, 0.05f, 2.1f), Wood, FRotator(-90.f, 0, 0), false);
		Part(O, Rig, Hn, TEXT("Cone"), FVector(150.f, 0, 0), FVector(0.1f, 0.1f, 0.3f), Steel, FRotator(-90.f, 0, 0), false);
		break;
	case 3: // staff
		Part(O, Rig, Hn, TEXT("Cylinder"), FVector(10.f, 0, 20.f), FVector(0.05f, 0.05f, 1.8f), Wood, FRotator::ZeroRotator, false);
		Part(O, Rig, Hn, TEXT("Sphere"), FVector(10.f, 0, 115.f), FVector(0.16f), Accent, FRotator::ZeroRotator, false, ESRMat::Fx, 8.f);
		break;
	case 4: // club
		Part(O, Rig, Hn, TEXT("Cylinder"), FVector(36.f, 0, 0), FVector(0.1f, 0.1f, 0.7f), Wood, FRotator(-90.f, 0, 0), false);
		Part(O, Rig, Hn, TEXT("Sphere"), FVector(70.f, 0, 0), FVector(0.2f), Wood, FRotator::ZeroRotator, false);
		break;
	case 5: // axe
		Part(O, Rig, Hn, TEXT("Cylinder"), FVector(45.f, 0, 0), FVector(0.06f, 0.06f, 1.0f), Wood, FRotator(-90.f, 0, 0), false);
		Part(O, Rig, Hn, TEXT("Cube"), FVector(85.f, 0, 14.f), FVector(0.24f, 0.04f, 0.34f), Steel, FRotator::ZeroRotator, false);
		break;
	case 6: // greatsword
		Part(O, Rig, Hn, TEXT("Cube"), FVector(75.f, 0, 0), FVector(1.3f, 0.04f, 0.14f), SR::Hex(0x50545e), FRotator::ZeroRotator, false);
		Part(O, Rig, Hn, TEXT("Cube"), FVector(8.f, 0, 0), FVector(0.06f, 0.4f, 0.07f), Accent, FRotator::ZeroRotator, false);
		break;
	default:
		break;
	}
}

FSRRig SR::BuildWolf(AActor* O, USceneComponent* Parent, const FLinearColor& Fur, const FLinearColor& Eyes, float Size)
{
	FSRRig Rig;
	Rig.bQuadruped = true;
	Rig.Root = AddPivot(O, Parent, FVector::ZeroVector);
	Rig.Root->SetRelativeScale3D(FVector(Size));
	Rig.Torso = AddPivot(O, Rig.Root, FVector(0, 0, 60.f));
	USceneComponent* T = Rig.Torso;
	const FLinearColor Dark = Fur * 0.55f;
	Part(O, Rig, T, TEXT("Cylinder"), FVector(-5.f, 0, 0), FVector(0.42f, 0.4f, 0.95f), Fur, FRotator(90.f, 0, 0));
	Part(O, Rig, T, TEXT("Sphere"), FVector(32.f, 0, 4.f), FVector(0.5f, 0.46f, 0.52f), Fur);
	Part(O, Rig, T, TEXT("Sphere"), FVector(-40.f, 0, 0), FVector(0.42f, 0.4f, 0.42f), Fur);
	Part(O, Rig, T, TEXT("Cube"), FVector(5.f, 0, 22.f), FVector(0.8f, 0.16f, 0.08f), Dark);

	Rig.Head = AddPivot(O, T, FVector(52.f, 0, 22.f));
	USceneComponent* Hd = Rig.Head;
	Part(O, Rig, Hd, TEXT("Cube"), FVector(12.f, 0, 2.f), FVector(0.32f, 0.27f, 0.26f), Fur);
	Part(O, Rig, Hd, TEXT("Cube"), FVector(34.f, 0, -4.f), FVector(0.26f, 0.15f, 0.13f), Fur);
	Part(O, Rig, Hd, TEXT("Sphere"), FVector(47.f, 0, -1.f), FVector(0.06f), FLinearColor(0.01f, 0.01f, 0.01f), FRotator::ZeroRotator, false);
	Part(O, Rig, Hd, TEXT("Cone"), FVector(4.f, -9.f, 20.f), FVector(0.09f, 0.08f, 0.18f), Dark);
	Part(O, Rig, Hd, TEXT("Cone"), FVector(4.f, 9.f, 20.f), FVector(0.09f, 0.08f, 0.18f), Dark);
	Part(O, Rig, Hd, TEXT("Sphere"), FVector(26.f, -8.f, 7.f), FVector(0.045f), Eyes, FRotator::ZeroRotator, false, ESRMat::Fx, 14.f);
	Part(O, Rig, Hd, TEXT("Sphere"), FVector(26.f, 8.f, 7.f), FVector(0.045f), Eyes, FRotator::ZeroRotator, false, ESRMat::Fx, 14.f);

	Rig.Tail = AddPivot(O, T, FVector(-55.f, 0, 8.f));
	Part(O, Rig, Rig.Tail, TEXT("Cone"), FVector(-24.f, 0, 6.f), FVector(0.14f, 0.14f, 0.6f), Fur, FRotator(-110.f, 0, 0));

	const FVector Hips[4] = { FVector(32.f, -13.f, -5.f), FVector(32.f, 13.f, -5.f), FVector(-36.f, -13.f, -5.f), FVector(-36.f, 13.f, -5.f) };
	for (const FVector& HP : Hips)
	{
		USceneComponent* L = AddPivot(O, Rig.Root, HP + FVector(0, 0, 60.f));
		Part(O, Rig, L, TEXT("Cylinder"), FVector(0, 0, -27.f), FVector(0.11f, 0.11f, 0.56f), Fur);
		Part(O, Rig, L, TEXT("Sphere"), FVector(3.f, 0, -55.f), FVector(0.12f, 0.1f, 0.07f), Dark);
		Rig.Legs.Add(L);
	}
	return Rig;
}

FSRRig SR::BuildSpider(AActor* O, USceneComponent* Parent, const FLinearColor& Body, float Size)
{
	FSRRig Rig;
	Rig.bSpider = true;
	Rig.Root = AddPivot(O, Parent, FVector::ZeroVector);
	Rig.Root->SetRelativeScale3D(FVector(Size));
	Rig.Torso = AddPivot(O, Rig.Root, FVector(0, 0, 55.f));
	USceneComponent* T = Rig.Torso;
	const FLinearColor Mark = SR::Hex(0xb02020);
	Part(O, Rig, T, TEXT("Sphere"), FVector(-38.f, 0, 12.f), FVector(0.85f, 0.7f, 0.62f), Body);
	Part(O, Rig, T, TEXT("Sphere"), FVector(-50.f, 0, 40.f), FVector(0.3f, 0.2f, 0.06f), Mark, FRotator(-20.f, 0, 0));
	Part(O, Rig, T, TEXT("Sphere"), FVector(14.f, 0, 0), FVector(0.48f, 0.44f, 0.36f), Body);
	Rig.Head = AddPivot(O, T, FVector(34.f, 0, 2.f));
	for (int32 e = 0; e < 4; ++e)
	{
		Part(O, Rig, Rig.Head, TEXT("Sphere"), FVector(3.f, -9.f + e * 6.f, 6.f + (e % 2) * 4.f), FVector(0.04f), FLinearColor(1.f, 0.1f, 0.05f), FRotator::ZeroRotator, false, ESRMat::Fx, 14.f);
	}
	Part(O, Rig, Rig.Head, TEXT("Cone"), FVector(8.f, -5.f, -10.f), FVector(0.04f, 0.04f, 0.16f), SR::Hex(0x1a1a1a), FRotator(160.f, 0, 0), false);
	Part(O, Rig, Rig.Head, TEXT("Cone"), FVector(8.f, 5.f, -10.f), FVector(0.04f, 0.04f, 0.16f), SR::Hex(0x1a1a1a), FRotator(160.f, 0, 0), false);

	for (int32 i = 0; i < 8; ++i)
	{
		const float Side = (i % 2) ? 1.f : -1.f;
		const int32 Row = i / 2;
		const float Yaw = Side * (40.f + Row * 30.f);
		const FRotator Rest(0, Yaw, 0);
		USceneComponent* L = AddPivot(O, T, FVector(22.f - Row * 12.f, Side * 14.f, 0), Rest);
		Part(O, Rig, L, TEXT("Cylinder"), FVector(30.f, 0, 17.f), FVector(0.07f, 0.07f, 0.7f), Body, FRotator(-60.f, 0, 0));
		Part(O, Rig, L, TEXT("Cylinder"), FVector(72.f, 0, -10.f), FVector(0.06f, 0.06f, 0.93f), Body, FRotator(164.f, 0, 0));
		Rig.Legs.Add(L);
		Rig.LegRest.Add(Rest);
	}
	return Rig;
}
