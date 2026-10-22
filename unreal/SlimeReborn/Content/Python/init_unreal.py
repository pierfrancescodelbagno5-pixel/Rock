"""
Slime Reborn - automatic material setup.

Unreal runs every `init_unreal.py` found in Content/Python when the editor starts.
This script creates the four materials the game looks for in /Game/SR. If they are
missing the game still runs (it falls back to the engine's BasicShapeMaterial), but
with them you get glowing magic, a translucent jelly slime, water and colour variation.

You can also run it by hand: Tools > Execute Python Script... > this file.
"""
import os
import unreal

PKG = "/Game/SR"
MEL = unreal.MaterialEditingLibrary


def _on_disk(name):
    content = unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_content_dir())
    return os.path.exists(os.path.join(content, "SR", name + ".uasset"))


def _expr(mat, cls, x, y):
    return MEL.create_material_expression(mat, cls, x, y)


def _scalar(mat, name, value, x, y):
    e = _expr(mat, unreal.MaterialExpressionScalarParameter, x, y)
    e.set_editor_property("parameter_name", name)
    e.set_editor_property("default_value", value)
    return e


def _multiply(mat, a, b, x, y):
    m = _expr(mat, unreal.MaterialExpressionMultiply, x, y)
    MEL.connect_material_expressions(a, "", m, "A")
    MEL.connect_material_expressions(b, "", m, "B")
    return m


def _make(name, blend, shading, glow=0.0, opacity=None, roughness=0.7, variation=False, two_sided=False):
    if _on_disk(name):
        return False
    tools = unreal.AssetToolsHelpers.get_asset_tools()
    mat = tools.create_asset(name, PKG, unreal.Material, unreal.MaterialFactoryNew())
    mat.set_editor_property("blend_mode", blend)
    mat.set_editor_property("shading_model", shading)
    mat.set_editor_property("two_sided", two_sided)
    mat.set_editor_property("used_with_instanced_static_meshes", True)

    color = _expr(mat, unreal.MaterialExpressionVectorParameter, -1000, -300)
    color.set_editor_property("parameter_name", "Color")
    color.set_editor_property("default_value", unreal.LinearColor(1.0, 1.0, 1.0, 1.0))

    base = color
    if variation:
        noise = _expr(mat, unreal.MaterialExpressionNoise, -1000, 0)
        noise.set_editor_property("scale", 0.0035)
        noise.set_editor_property("output_min", 0.0)
        noise.set_editor_property("output_max", 1.0)
        noise.set_editor_property("levels", 4)
        lerp = _expr(mat, unreal.MaterialExpressionLinearInterpolate, -700, 0)
        lerp.set_editor_property("const_a", 0.78)
        lerp.set_editor_property("const_b", 1.15)
        MEL.connect_material_expressions(noise, "", lerp, "Alpha")
        base = _multiply(mat, color, lerp, -450, -200)

    glow_p = _scalar(mat, "Glow", glow, -1000, 300)
    emissive = _multiply(mat, color, glow_p, -450, 250)

    if shading == unreal.MaterialShadingModel.MSM_UNLIT:
        if opacity is not None:
            op = _scalar(mat, "Opacity", opacity, -1000, 500)
            emissive = _multiply(mat, emissive, op, -250, 350)
        MEL.connect_material_property(emissive, "", unreal.MaterialProperty.MP_EMISSIVE_COLOR)
    else:
        MEL.connect_material_property(base, "", unreal.MaterialProperty.MP_BASE_COLOR)
        MEL.connect_material_property(emissive, "", unreal.MaterialProperty.MP_EMISSIVE_COLOR)
        rough = _scalar(mat, "Roughness", roughness, -1000, 650)
        MEL.connect_material_property(rough, "", unreal.MaterialProperty.MP_ROUGHNESS)
        if opacity is not None:
            op = _scalar(mat, "Opacity", opacity, -1000, 850)
            MEL.connect_material_property(op, "", unreal.MaterialProperty.MP_OPACITY)
            try:
                mat.set_editor_property("translucency_lighting_mode", unreal.TranslucencyLightingMode.TLM_SURFACE_PER_PIXEL_LIGHTING)
            except Exception:
                pass

    MEL.recompile_material(mat)
    unreal.EditorAssetLibrary.save_loaded_asset(mat)
    unreal.log("Slime Reborn: created material %s/%s" % (PKG, name))
    return True


def build_all():
    made = 0
    made += _make("M_SRLit", unreal.BlendMode.BLEND_OPAQUE, unreal.MaterialShadingModel.MSM_DEFAULT_LIT, glow=0.0, roughness=0.75, variation=True)
    made += _make("M_SRFx", unreal.BlendMode.BLEND_ADDITIVE, unreal.MaterialShadingModel.MSM_UNLIT, glow=10.0, opacity=1.0, two_sided=True)
    made += _make("M_SRSlime", unreal.BlendMode.BLEND_TRANSLUCENT, unreal.MaterialShadingModel.MSM_DEFAULT_LIT, glow=0.35, opacity=0.78, roughness=0.12)
    made += _make("M_SRWater", unreal.BlendMode.BLEND_TRANSLUCENT, unreal.MaterialShadingModel.MSM_DEFAULT_LIT, glow=0.0, opacity=0.82, roughness=0.04, two_sided=True)
    if made:
        unreal.log("Slime Reborn: %d materiali creati in %s. Premi Play!" % (made, PKG))


try:
    build_all()
except Exception as exc:  # never block the editor start-up
    unreal.log_warning("Slime Reborn: material setup failed: %s" % exc)
